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

/*
  MIDDLEWARE
*/

//middlewear for retrieving the body information from req
//app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({extended: true}));

//add middlewear for handling user sessions
app.use(sessions({
    cookieName: "session",
    secret: 'alkdsjhvprjshadalkajslhfkjvcnlakerjgblkajdfhliure',
    duration: 30 * 60 * 1000,             //this session duration is 30min
    activeDuration: 5 * 60 * 1000,        //if expiresIn < activeDuration, session extended this much
}));

//TODO: custom middleware for handling session data

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

mongoose.connect("mongodb://localhost/mobileApp");  //connect to our local database

/*
  ROUTES
*/

//route for registering a user. see user schema for what should be passed.
app.post("/register", (req, res) => {
    //hash and salt our passwords like good people 
    var pHash = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10));
    var user = new User({
	firstName: req.body.firstName,
	lastnName: req.body.lastName,
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

app.post("/login", (req, res) => {
    User.findOne({ email: req.body.email}, (err, user) => {
	//if no user is found for this requrest, respond with error
	if(!user) {
	    res.json({error: "Error: no user found with this email"});
	} else {
	    console.log(user);
	    //if the password matches our users password...
	    if(bcrypt.compareSync(req.body.password, user.password)) {
		//set the sessions user appropriately
		req.session.user = user;
		res.json({status: "Success", email: user.email});
	    } else {
		res.json({error: "incorrect email or password"});
	    }
	    
	}
    });
});


app.get('/logout', (req, res) => {
    req.session.reset();
    res.json({message: "you have logged out"});
});

/*
app.get('/userinfo', (req, res) => {
    if (req.session)
});
*/
/*
  Make this app live by binding it to a port
*/
var server = app.listen("3000", function () {
    var port = server.address().port;
    console.log("Backend listening on port %s", port);
});

//export the server variable to our module, so that when somthing else 
//wants to use server, all it needs to do is var app = require("app.js"); app.xxx...
module.exports = server;




