if (!console.time) {
	(function (timer) {
		var timeStarts = {}, avg = {};

		this.time = function (id) {
			timeStarts[id] = timer.now();
		};
		
		this.timeEnd = function (id) {
			var delta = timer.now() - timeStarts[id];
			if (!(id in avg)) {
				avg[id] = {
					sum: 0,
					count: 0,
					valueOf: function () { return this.sum / this.count }
				};
			}
			avg[id].sum += delta;
			avg[id].count++;
			this.log(id + ': ' + delta + ' ms');
			delete timeStarts[id];
		};
	}).call(console, typeof performance !== 'undefined' && 'now' in performance ? performance : Date);
}