var path = require('path');
var express = require("express");
//orm for our mongoose database....
var mongoose = require('mongoose');
//middlewear to expose req.body on routes
var bodyParser = require("body-parser");
//mozilla module for handling client sessions
var sessions = require("client-sessions");
//encription module for hashing and salting passwords
var bcrypt = require("bcryptjs");
var async = require("async");

var youtube = require("youtube-api");

//our app
var app = express();

//dependencies for streaming youtube audio
var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');

//private local variables
const CREDENTIALS = require(path.resolve(__dirname, "./credentials.json"));

const discogs = require("disconnect")
    .Client(null,
            {
                consumerKey: CREDENTIALS.DISCOGS.CONSUMERKEY,
                consumerSecret: CREDENTIALS.DISCOGS.CONSUMERSECRET
            });

const discogsDb = discogs.database();

app.set('port', (process.env.PORT || 5000));



/*
  MIDDLEWARE
*/

//middlewear for retrieving the body information from req
app.use(bodyParser.urlencoded({extended: true}));

//add middlewear for handling user sessions
app.use(sessions({
    cookieName: "session",
    secret: 'alkdsjhvprjshadalkajslhfkjvcnlakerjgblkajdfhliure',
    duration: 10 * 60 * 60 * 1000,             //this session duration is 10 hours
    activeDuration: 5 * 60 * 1000,        //if expiresIn < activeDuration, session extended this much
}));


//Custom middleware for handling session data
anpp.use((req, res, next) => {
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

var songSchema = Schema({
    title: String,
    imgurl: String,
    dateCreated: { type: Date, default: Date.now() },
    src: String, 
    id: {
	type: String,
	enum: ['YouTube']
    }

});
var Song = mongoose.model("Song", songSchema); 

var playlistSchema = Schema({
    name: String,
    userId: {
	type: mongoose.Schema.Types.ObjectId,
	ref: "User"
    },
    songs: [{
	type: mongoose.Schema.Types.ObjectId,
	unique: true,
	dropDups: true,
	ref: 'Song'
    }]
});
//create a composite primary key out of playlist userId and name
playlistSchema.index({ name: 1, userId: 1 }, { unique: true });
var Playlist = mongoose.model("Playlist", playlistSchema);

var userSchema = Schema({          //set up the orms for the database
    firstName: String,
    lastName: String,
    userName: String,
    email: { type: String, unique: true },
    password: String,
    playlists: [{
	type: mongoose.Schema.Types.ObjectId,
	ref: 'Playlist' 
    }],
    songs: [{
	type: mongoose.Schema.Types.ObjectId,
	ref: 'Song'
    }],
});
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

    var invalidEditFields = ["password", "email", "songs", "playlists", "__v", "_id"];

    User.findOne({email: req.user.email}, (err, user) => {
	if(err) req.send({error: "error, bad request, no such user logged in"});
	
	for(var v in req.body) {
	    if(user[v] 
	       && req.body[v] != user[v]) {

		if(invalidEditFields.indexOf(v) > -1) {
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

//allow the user to add a song to their playlist
app.post("/addSongToPlaylist", requireLogin, (req, res) => {
    
    Playlist.findOne({
	userId: req.user._id,
	name: req.body.playlistName
    }, (err, playlist) => {
	//we have found the requested playlist
	//make sure the song sent matches a song in user library
	if(err) {
	    res.send({ error: err });
	    return;
	}

	User.findOne({
	    _id: req.user
	}, (uErr, user) => {
	    if(uErr) {
		res.send({ error: uErr });
		return;
	    }
	    //if this song is in the users library
	    //and verify that playlist belongs to user
	    //and verify the song isnt already in the playlist
	    console.log(user.songs);
	    if(user.songs.indexOf(req.body.songId) >= 0
	      & user.playlists.indexOf(playlist._id) >= 0) {
		if(playlist.songs.indexOf(req.body.songId) < 0) {
		    //add this song to the playlist kid
		    Playlist.findOneAndUpdate({
			userId: req.user._id,
			name: req.body.playlistName
		    }, 
		    { $push: { songs: req.body.songId } },
		    { safe: true, upsert: true },
		    (pushErr, result) => {
			if(pushErr) {
			    res.send({ error: pushErr });
			    return;
			}
			res.send("song " 
				 + req.body.songId 
				 + " successfully added to playlist " 
				 + req.body.playlistName);
		    });
		} else {
		    res.send({ error: "Song already in playlist" });
		    return;
		}
	    } else {
		res.send({error: "song or playlist not found in user"});
		return;
	    }
	});
    });
});

app.get("/userPlaylists", requireLogin, (req, res) => {
    User.findOne({
	_id: req.user._id,
    })
	.populate("playlists")
	.exec((err, user) => {
	    if(err) {
		res.send({ error: err });
		return;
	    } else {
		res.json(user.playlists);
	    }
	});
});

app.post("/getPlaylist", requireLogin, (req, res) => {

    Playlist.findOne({
	_id: req.body.playlistId,
    })
	.populate("songs")
	.exec((err, playlist) => {
	    console.log(playlist);
	    if(err){
		res.send({ error: err });
		return;
	    } else {
		res.json({ 
		    name: playlist.name,
		    songs: playlist.songs
		});
	    }
	});
});

//allow the user to create a playlist
app.post("/createPlaylist", requireLogin, (req, res) => {
    
    playlist = new Playlist(
	{
	    name: req.body.playlistName,
	    userId: req.user._id
	});

    playlist.save((err) => {
	if(err) {
	    if(err.code === 11000) {
		res.send({error: "User "
			  + req.user.email
			  + "  already has playlist named "
			  + req.body.playlistName});
		return;
	    }
	    res.send({error: err});
	    return;
	} else {
	    User.findOneAndUpdate({ _id: req.user._id },
				  {$push: { playlists: playlist._id } },
				  { safe: true, upsert: true },
				  (e, user) => {
				      if(e) {
					  res.send(e);
					  return;
				      }
				  });
	    console.log("playlist " + req.body.playlistName + " successfull");
	    res.json(playlist);
	}
    });
});

app.get("/userLibrary", requireLogin, (req, res) => {
    User.findOne({
	_id: req.user._id,
    })
	.populate('songs')
	.exec((err, user) => {
	    if(err) {
		res.send({ error: err });
		return;
	    }
	    console.log(user);
	    res.send(user.songs);
	    return;
	})
});

//add a song to the users library
app.post("/addToLibrary", requireLogin, (req, res) => {

    var songToInsert;
    var songFound = false;

	
    Song.findOne({
	src: req.body.src,
	id: req.body.srcId
    }, (err, song) => {
	if(song) {   //if the song src already exisits in song collection get it
	    songToInsert = song;
	} else if(err){
	    console.log(err);
	} else {      //if this is a newly sourced song add it to the db
	    songToInsert = new Song({
		title: req.body.title,
		imgurl: req.body.imgurl,
		src: req.body.src,
		id: req.body.srcId
	    });
	    songToInsert.save((err) => {
		if(err) {
		    console.log(err); return;
		} else {
		    console.log("new song saved to collection");
		}    
	    });
	    console.log("songToInsert: \n" + songToInsert);
	}
	
	//we have establised a song now handle adding to library
	//look into efficencies of populate vs findOne() for expanding user songs
	User.findOne({email: req.user.email}, (err, doc) => {
	
	    //use a map here instead of a list for doc.songs to speed search?
	    async.each(doc.songs,
		       (songToPopulate, callback) => {
			   Song.findOne({_id: songToPopulate}, (err, userSong) => {
			       console.log("the user song Id : " + songToPopulate);
			       //TODO: replace this validation with a composite pk
			       //on our schemas 
			       if(songToInsert.id === userSong.id
				  & songToInsert.src === userSong.src) {
				   songFound = true;
				   console.log("song already in library");
			       }
			       callback();
			   });
		       },
		       (e) => {
			   //if the song isn't already in the users database
			   if(!songFound){
			       User.update(
				   {email: req.user.email}, 
				   { $push: { songs: songToInsert._id } },
				   {safe: true, upsert: true},
				   (err, user) => {
				       if(err) {
					   res.send(err);
					   return;
				       } else {
					   res.send(song);
					   return;
				       }
				   });
			   } else {
			       res.send({error: "source already exsists in user library"})
			       return;
			   }
		       });
	});
    });	     
});

//youtube search
//TODO: youtube category id reigon specific?

const youTubeSearch =  (title, callback) => {

    var found = youtube.search.list({
	part: "snippet",
	q: title,
	type: "video",
	videoCategoryId: 10,
        maxResults: 5,
        })
    .on("complete", (data) => {
	console.log("youtube data : " + data.body.items);
	callback(data.body.items);
	
    })
    .on("error", (err) => {
	console.log(err);
	callback({error: err});
    });

};

//discogs search
//TODO: accurately id song titles
//TODO: retrieve songs from record to source
//TODO: better source for album art
//TODO: incorperate record information
/*
app.post("/adv_search", (req, res) => {
    var toReturn = [];
    discogsDb.search(req.body.query,
    		     (err, data) => {
	if(data.pagination.items > 1) {
	    async.each(data.results.slice(0, 1),
		       (item, callback) => {
			  console.log(item);
			  youTubeSearch(item.title, (result) => {
			      result.forEach((i) => {
				  toReturn.push({
				      imgurl: item.thumb,
				      title: i.snippet.title,
				      videoId: i.id.videoId
				  });
			      });
			      callback();
			  });
		       },
		       (err) => {
			   if(err) {
			       res.send({error: "Error"});
			   } else {
			       res.json(toReturn);
			   }
			       
		       });
	} else if(data.pagination.items == 1) {
	    youTubeSearch(data.results[0].title, (result) => {
		toReturn.push(result);
		res.json(toReturn);
	    });
	} else {
	    res.send({error: "no results found"});
	}
    });
});
*/
//most simple audio streaming for node
app.post("/stream_yt", (req, res) => {
    var url = 'https://www.youtube.com/watch?v=' + req.body.youtubeID;
    
    res.set({'Content-Type' : 'audio/mpeg'});
        
    var stream = ytdl(url);
    var proc = new ffmpeg({source: stream})
	.on("stderr", (stderr) => {
	    console.log("stderr: " + stderr);
	})
	.on('error', (err, stdout, stderr) => {
	    console.log("error : " + err.message);
	})
	.on("end", (stdout, stderr) => {
	    console.log('stream encoded and send successfull');
	})
        .toFormat('mp3')
	.writeToStream(res, {end:true});
  
});

/*
  Make this app live by binding it to a port
*/
app.listen(app.get('port'), () => {
    console.log("Backend listening on port %s", app.get('port'));
});

