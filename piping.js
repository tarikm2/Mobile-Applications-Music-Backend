var path     = require("path");
var fs       = require("fs");
var ffmpeg   = require("fluent-ffmpeg");
var ytdl     = require("ytdl-core");
var spawn    = require("child_process").spawn;

var url = "https://www.youtube.com/watch?v=Q8w81AAK7to";

var ytVideo = ytdl(url, {filter: function(format) {
    return format.container ==='mp4';
}
}).pipe(fs.createWriteStream("audiosong.mp3"));

//var ffStream = fs.createWriteStream("testAudioFF.mp3");

//var ffWkr = new ffmpeg(ytVideo);

//var output = ffWkr.format("mp3").pipe(ffStream);

//output.on('error', ytVideo.end.bind(ytVideo));
//output.on('error', ffStream.emit.bind(ffStream, 'error'));


/*
var ffm = spawn('ffmpeg', ['-i', '-', '-vn', '-ac', 2, '-ar', 44100, '-ab', '128k', '-f', 'mp3', '-']);

ffm.stdout.on('end', function(){
    ffm.kill();
});

ytVideo.pipe(ffm.stdin);
//ffm.stdout.pipe({file: "song2.mp3"});
var writer = fs.createWriteStream("testAudioFF.mp3");

ffm.stdout.pipe(writer);
*/


