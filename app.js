var express = require("express");
var mongoose = require('mongoose');
var bodyParser = require("body-parser");
var jade = require("jade");
var bcrypt = require("bcryptjs");
var app = express();


//set the view engine
app.set('view engine', 'jade');


/*
  MIDDLEWARE
*/

/*
  DATABASE:
  the database currently links a user to a list of songs, which contains sorcing information
  for retriving the song.
*/
var Schema = mongoose.Schema;

//set up the orm for the database
var userSchema = Schema({
    id: Schema.ObjectId,
    firstName: String,
    lastName: String,
    userName: {type: String, unique: true },
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

var Song = mongoose.model('Song', songSchema);
var User = mongoose.model("User", userSchema);

mongoose.connect("mongodb://localhost/mobileApp");
//END DATABASE CONFIG

//middlewear for retrieving the body information from req
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.render("index.jade");
});

app.get("/register", (req, res) => {
    res.render("register.jade");
});

app.post("/register", (req, res) => {
    var pHash = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10));
    var user = new User({
	firstName: req.body.firstName,
	lastName: req.body.lastName,
	userName: req.body.userName,
	email: req.body.email,
	password: pHash,
    });

    user.save((err) => {
	if(err) {
	    var error = "Somthing went wrong I dont know why.";
	    if(err.code === 11000) {
		error = "Email or Username already taken, choose another.";
		//TODO error handling for either email or username conflict
	    }
	    res.render('register.jade', {error: error});
	} else {
	   // res.redirect("/dashboard");
	    res.json(user);
	}
    });   
});

app.get("/dashboard", (req, res) => {
    
});

app.listen("3000");

