'use strict';

require(['async', 'jbinary', './mpegts_to_mp4/mpegts', './mpegts_to_mp4/index', 'consoleTime', 'consoleWorker'],
	function (async, jBinary, MPEGTS, mpegts_to_mp4) {
		addEventListener('message', function (event) {
			// processing received sources one by one
			async.eachSeries(event.data, function (msg, callback) {
				jBinary.load(msg.url, MPEGTS, function (err, mpegts) {
					// tell async we can load next one
					callback(err);
					if (err) return;

					console.time('convert');
					var mp4 = mpegts_to_mp4(mpegts);
					console.timeEnd('convert');

					postMessage({
						type: 'video',
						index: msg.index,
						original: msg.url,
						url: mp4.toURI('video/mp4')
					});
				});
			});
		});

		postMessage({type: 'ready'});
	}
);


