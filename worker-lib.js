'use strict';

function HLSPlayer(canvas, manifestUrl, options) {
  options = options || {};

  var workerSrc = '/* WORKER_SOURCE_GOES_HERE */';
  var worker = new Worker( URL.createObjectURL(new Blob([workerSrc])) );

  var nextIndex = 0;
  var sentVideos = 0;
  var currentVideo = null;
  var videos = [];
  var lastOriginal;
  var context = canvas.getContext('2d');

  canvas.play = function() { if(currentVideo) currentVideo.play(); };
  canvas.pause = function() { if(currentVideo) currentVideo.pause(); };
  canvas.stop = function() {
    if(currentVideo) currentVideo.pause();
    if(worker) {
      worker.terminate();
      worker = null;
    }
  }

  // drawing new frame
  function nextFrame() {
    if (currentVideo.paused || currentVideo.ended) {
      return;
    }
    context.drawImage(currentVideo, 0, 0);
    requestAnimationFrame(nextFrame);
  }

  worker.addEventListener('message', function (event) {
    var data = event.data, descriptor = '#' + data.index + ': ' + data.original;

    switch (data.type) {
      // worker is ready to convert
      case 'ready':
        getMore();
        return;

      // got debug message from worker
      case 'debug':
        Function.prototype.apply.call(console[data.action], console, data.args);
        return;

      // got new converted MP4 video data
      case 'video':
        var video = document.createElement('video'), source = document.createElement('source');
        source.type = 'video/mp4';
        video.appendChild(source);

        video.addEventListener('loadedmetadata', function () {
          if (canvas.width !== this.videoWidth || canvas.height !== this.videoHeight) {
            canvas.width = this.width = this.videoWidth;
            canvas.height = this.height = this.videoHeight;
          }
        });

        video.addEventListener('play', function () {
          if (currentVideo !== this) {
            if (!currentVideo) {
              if(!options.autoplay)
                this.pause();

              if(typeof(options.canplay) == "function")
                options.canplay.call(this);
            }

            currentVideo = this;
            nextIndex++;
            if (sentVideos - nextIndex <= 1) {
              getMore();
            }
          }
          nextFrame();
        });

        video.addEventListener('ended', function () {
          delete videos[nextIndex - 1];
          if (nextIndex in videos) {
            videos[nextIndex].play();
          }
        });
        if (video.src.slice(0, 5) === 'blob:') {
          video.addEventListener('ended', function () {
            URL.revokeObjectURL(this.src);
          });
        }

        video.src = source.src = data.url;
        video.load();

        (function canplaythrough() {
          videos[data.index] = this;
          if ((!currentVideo || currentVideo.ended) && data.index === nextIndex) {
            this.play();
          }
        }).call(video);

        return;
    }
  });

  // relative URL resolver
  var resolveURL = (function () {
    var doc = document,
      old_base = doc.getElementsByTagName('base')[0],
      old_href = old_base && old_base.href,
      doc_head = doc.head || doc.getElementsByTagName('head')[0],
      our_base = old_base || doc.createElement('base'),
      resolver = doc.createElement('a'),
      resolved_url;

    return function (base_url, url) {
      old_base || doc_head.appendChild(our_base);

      our_base.href = base_url;
      resolver.href = url;
      resolved_url  = resolver.href; // browser magic at work here

      old_base ? old_base.href = old_href : doc_head.removeChild(our_base);

      return resolved_url;
    };
  })();

  function getMore() {
    var ajax = new XMLHttpRequest();
    ajax.addEventListener('load', function () {
      var originals =
        this.responseText
        .split(/\r?\n/)
        .filter(RegExp.prototype.test.bind(/\.ts$/))
        .map(resolveURL.bind(null, manifestUrl));

      originals = originals.slice(originals.lastIndexOf(lastOriginal) + 1);
      lastOriginal = originals[originals.length - 1];

      worker.postMessage(originals.map(function (url, index) {
        return {url: url, index: sentVideos + index};
      }));

      sentVideos += originals.length;

      //console.log('asked for ' + originals.length + ' more videos');
    });
    ajax.open('GET', manifestUrl, true);
    ajax.send();
  }

  return canvas;

};