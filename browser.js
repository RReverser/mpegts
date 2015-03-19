(function () {
	'use strict';

	// requestAnimationFrame polyfill
	window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame || setTimeout;

	// preconfiguration using <script>'s data-attributes values
	var scripts = document.getElementsByTagName('script'),
		script = scripts[scripts.length - 1],
		worker = new Worker('worker-main.js'),
		nextIndex = 0,
		sentVideos = 0,
		currentVideo = null,
		videos = [],
		lastOriginal,
		canvas = document.getElementById(script.getAttribute('data-canvas')),
		manifest = script.getAttribute('data-hls'),
		context = canvas.getContext('2d');

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
							// UI initialization magic to be left in main HTML for unobtrusiveness
							new Function(script.text).call({
								worker: worker,
								canvas: canvas,
								get currentVideo() { return currentVideo }
							});
						}
						console.log('playing ' + descriptor);
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
					console.log('converted ' + descriptor);
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

	// loading more videos from manifest
	function getMore() {
		var ajax = new XMLHttpRequest();
		ajax.addEventListener('load', function () {
			var originals =
				this.responseText
				.split(/\r?\n/)
				.filter(RegExp.prototype.test.bind(/\.ts$/))
				.map(resolveURL.bind(null, manifest));

			originals = originals.slice(originals.lastIndexOf(lastOriginal) + 1);
			lastOriginal = originals[originals.length - 1];

			worker.postMessage(originals.map(function (url, index) {
				return {url: url, index: sentVideos + index};
			}));

			sentVideos += originals.length;

			console.log('asked for ' + originals.length + ' more videos');
		});
		ajax.open('GET', manifest, true);
		ajax.send();
	}
})();