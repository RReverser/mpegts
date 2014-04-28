(function () {
	// requestAnimationFrame polyfill
	window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame || setTimeout;

	// preconfiguration using <script>'s data-attributes values
	var scripts = document.getElementsByTagName('script'),
		script = scripts[scripts.length - 1],
		worker = new Worker('mpegts-to-mp4/worker.js'),
		video = document.getElementById(script.getAttribute('data-video')),
		ms = new MediaSource(),
		manifest = script.getAttribute('data-hls');

	video.src = URL.createObjectURL(ms);

	ms.addEventListener('sourceopen', function () {
		var sourceBuffer = ms.addSourceBuffer('video/mp4;codecs="avc1.4D401F, mp4a.40.5"');

		worker.addEventListener('message', function (event) {
			var data = event.data, descriptor = '#' + data.index + ': ' + data.original;

			switch (data.type) {
				// got debug message from worker
				case 'debug':
					Function.prototype.apply.call(console[data.action], console, data.args);
					return;

				// got new converted MP4 video data
				case 'video':
					var xhr = new XMLHttpRequest();
					xhr.open('GET', 'sample2.mp4', true);
					xhr.responseType = 'arraybuffer';

					xhr.onload = function (event) {
						sourceBuffer.appendBuffer(new Uint8Array(this.response));
					};

					xhr.send();

					console.log('converted ' + descriptor);

					return;
			}
		});

		function getMore() {
			worker.postMessage([{
				url: '../sample.ts',
				index: 0
			}]);
		}

		getMore();
	});
})();