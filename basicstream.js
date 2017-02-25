var ytdl = require("ytdl-core");
var ffmpeg = require("fluent-ffmpeg");
var fs = require("fs");

var stream = ytdl("https://www.youtube.com/watch?v=OJ8TYNpJdLg");

var proc = new ffmpeg({source: stream});
proc.saveToFile("britpop.mp3", function(stdout, stderr) {
    if (stderr) {
	return stderr;
    }
    return console.log('done');
}
);
