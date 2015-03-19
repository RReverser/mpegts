var gulp = require("gulp");
var rename = require("gulp-rename");
var umd = require("gulp-umd");
var server = require("gulp-server-livereload");
var fileInsert = require("gulp-file-insert");
var requirejs = require('requirejs');

gulp.task("build", function(){
  // build the worker as a self-contained module
  var config = {
    baseUrl: ".",
    name: "bower_components/almond/almond",
    include: ["worker"],
    mainConfigFile: "require-config.js",
    preserveLicenseComments: false,
    out: "dist/worker.js"
  };
  requirejs.optimize(config,
    function (output){ },
    function(err) { console.log(err); }
  );

  // insert the source code of the worker into the library
  gulp.src('./worker-lib.js')
    .pipe(fileInsert({
      "/* WORKER_SOURCE_GOES_HERE */": config.out,
    }))
    .pipe(rename("hlsplayer.js"))
    .pipe(umd({
      exports: function(file) { return "HLSPlayer" },
      namespace: function(file) { return "HLSPlayer" }
    }))
    .pipe(gulp.dest("./dist/"));
});


gulp.task("webserver", function() {
  gulp.src(".")
    .pipe(server({
      host: "0.0.0.0",
      defaultFile: "index.html",
      livereload: true,
      open: true
    }));
});


gulp.task("default", ["build","webserver"]);