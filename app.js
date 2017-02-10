var path = require('path');
var express = require("express");
//orm for our mongoose database
var mongoose = require('mongoose');
//middlewear to expose req.body on routes
var bodyParser = require("body-parser");
//mozilla module for handling client sessions
var sessions = require("client-sessions");
//encription module for hashing and salting passwords
var bcrypt = require("bcryptjs");
//our app
var app = express();


//dependencies for streaming youtube audio
var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');

app.set('port', (process.env.PORT || 5000));


//private local variables
const CREDENTIALS = require(path.resolve(__dirname, "./credentials.json"));

/*
  MIDDLEWARE
*/

//middlewear for retrieving the body information from req
app.use(bodyParser.urlencoded({extended: true}));

//add middlewear for handling user sessions
app.use(sessions({
    cookieName: "session",
    secret: 'alkdsjhvprjshadalkajslhfkjvcnlakerjgblkajdfhliure',
    duration: 30 * 60 * 1000,             //this session duration is 30min
    activeDuration: 5 * 60 * 1000,        //if expiresIn < activeDuration, session extended this much
}));


//Custom middleware for handling session data
app.use((req, res, next) => {
    //if there is a user in the current session from this request
    if(req.session && req.session.user) {
	//try to get the user from our database
	User.findOne({email: req.session.user.email}, (err, user) => {
	    //if the session user matched with one from our database
	    if(user) {
		console.log("we are in the session middlewear");
		//this is to keep route code neat by updating the incoming requests user
		//object with the session info.
		//set the user of this request to the sessions user
		req.user = user;
		
		//security: remove uneccesary sensitive information
		 req.user.password = undefined;
		console.log(req.user);
		//security: reset the session user to the user clear of sesitive info
		req.session.user = user;
		res.locals.user = user;     		//QUESTION: what are locals, really?
	    }
	    next();    //call the next process
	});
    } else {
	next();
    }
});

//Custom middlewear to require a user session for certain functionality
function requireLogin(req, res, next) {
    //if no user session is found in this request
    if(!req.user) {
	res.send({error: "Error: cannot access because no user is logged in. please login"});
    } else {
	next();
    }
};

//custom middleware to reqire a user is logged in
function requireLogout(req, res, next) {
    if(req.user) {
	res.send({error: "Error: user currently signed in, please sign out"});
    } else {
	next();
    }
};

/*
  DATABASE:
  the database currently links a user to a list of songs, which contains sorcing information
  for retriving the song.
*/
var Schema = mongoose.Schema;      //for defining schemas
var ObjectId = Schema.ObjectId;

var userSchema = Schema({          //set up the orms for the database
    id: ObjectId,
    firstName: String,
    lastName: String,
    userName: String,
    email: { type: String, unique: true },
    password: String,
    songs: [{ type: Schema.Types.ObjectId, ref: 'Song' }],
});


var songSchema = Schema({
    _owner : { type: Number, ref: "User"},
    title: String,
    sourceId: String,
    dateCreated: { type: Date, default: Date.now },
    souceObject: {},
});

var Song = mongoose.model("Song", songSchema); 
var User = mongoose.model("User", userSchema);

mongoose.connect("mongodb://"        //connect to our local database
		 + CREDENTIALS.DB.USER 
		 + ":" + CREDENTIALS.DB.PSWD 
		 + "@ds147079.mlab.com:47079/ca-fi_music");

/*
  ROUTES
*/


app.get('/', (req, res) => {
    res.send({message: "root, nothing is here"});
});
//route for registering a user. see user schema for what should be passed.
app.post("/register", requireLogout, (req, res) => {
    //hash and salt our passwords like good people 
    var pHash = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10));
    var user = new User({
	firstName: req.body.firstName,
	lastName: req.body.lastName,
	userName: req.body.userName,
	email: req.body.email,
	password: pHash,
    });

    console.log(req.body);
   
    //try to save user to database. if there is duplicate or error, respond with error
    user.save((err) => {
	if(err) {
	    var someError = "Somthing went wrong I dont know why.";
	    if(err.code === 11000) {
		someError = "Email or Username already taken, choose another.";
		//TODO error handling for either email or username conflict
	    }
	    res.json({error: someError});
	} else {
	    console.log("creation succsessful going to return json");
	    res.json(user);
	}
    });   
});


app.post("/login", requireLogout, (req, res) => {
    User.findOne({ email: req.body.email}, (err, user) => {
	//if no user is found for this requrest, respond with error
	if(!user) {
	    res.json({error: "Error: no user found with this email"});
	} else {
	    console.log(user);
	    //if the password matches our users password...
	    if(req.body.password 
	       && bcrypt.compareSync(req.body.password, user.password)) {
		//set the sessions user appropriately
		req.session.user = user;
		res.json({status: "Success", email: user.email});
	    } else {
		res.json({error: "incorrect email or password"});
	    }
	    
	}
    });
});


app.get('/logout', requireLogin, (req, res) => {
    req.session.reset();
    res.json({message: "you have logged out"});
});


app.delete('/delete_account', requireLogin, (req, res) => {
    User.remove({email: req.user.email}, (err, user) => {
	if (err) res.send({error: "Error: god save us now"});

	req.session.reset();
	res.send({ message: "successfully deleted account for " + req.user.email});
    });
});


app.get('/user_info', requireLogin, (req, res) => {
    res.send(req.user);
});

//TODO: set up an authenticated way to update critical info such as email, paswd
app.put("/update_user", requireLogin, (req, res) => {

    var invalidEditFields = ["password", "email", "songs", "__v", "_id"];

    User.findOne({email: req.user.email}, (err, user) => {
	if(err) req.send({error: "error, bad request, no such user logged in"});
	
	for(var v in req.body) {
	    if(user[v] 
	       && req.body[v] != user[v]) {

		if(invalidEditFields.includes(v)) {
		    res.send({error: "Cannot edit field " + v + ". protected"});
		    return;
		}

		var newVarObj = {};
		newVarObj[v] = req.body[v];
		User.update({email: user.email}, {$set: newVarObj}, (err, res) => {
		    if(err) res.send({error: "Error: could not edit a field requested"});
		    console.log("the paramater " + v + " success changed");
		});	
	    }
	}

	//return the updated user object
	User.findOne({email: user.email}, (errTwo, updated) => {
	    if(errTwo) res.send({error: "There has been an error fetching the updated object"});

//	    updated.password = undefined;
	    res.send(updated);
	});
    });
});

app.post("/stream_yt", (req, res) => {
    var url = 'https://www.youtube.com/watch?v=' + req.body.youtubeID;
   
    ytdl(url, {filter: (f) => {
	return f.container === 'mp4' && !f.encoding;
    }})
    .pipe(res);
});

/*
  Make this app live by binding it to a port
*/
app.listen(app.get('port'), function () {
    console.log("Backend listening on port %s", app.get('port'));
});

