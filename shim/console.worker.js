if (typeof console === 'undefined') {
	[
		'assert', 'clear', 'count', 'debug', 'dir', 'dirxml', 'error', 'exception',
		'group', 'groupCollapsed', 'groupEnd', 'info', 'log', 'markTimeline', 'profile',
		'profileEnd', 'table', 'timeStamp', 'trace', 'warn'
	]
	.forEach(function (methodName) {
		this[methodName] = function () {
			postMessage({
				type: 'debug',
				action: methodName,
				args: Array.prototype.slice.call(arguments)
			});
		};
	}, console = {});
}