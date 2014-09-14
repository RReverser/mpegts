#!/usr/bin/env node

// Enable advanced stack in dev mode.
if (process.env.NODE_ENV === 'development') {
	require('stack-displayname');

	Error.stackTraceLimit = Infinity;
	var prevPrepareStackTrace = Error.prepareStackTrace;
	Error.prepareStackTrace = function(error, frames) {
	    var firstNamedIndex = 0, firstNonNamedIndex = 0;
	    var filteredFrames = frames.filter(function(frame, index) {
	        if ('displayName' in frame.getFunction()) {
	            if (!firstNamedIndex) {
	                firstNamedIndex = index;
	            }
	            firstNonNamedIndex = index + 1;
	            return true;
	        } else {
	            return false;
	        }
	    });
	    return prevPrepareStackTrace(error, frames.slice(0, firstNamedIndex).concat(filteredFrames).concat(frames.slice(firstNonNamedIndex)));
	};
}

var jBinary = require('jbinary');
var MPEGTS = require('./mpegts_to_mp4/mpegts');
var mpegts_to_mp4 = require('./mpegts_to_mp4/index');

function convert(src, dest, callback) {
	jBinary.load(src, MPEGTS, function (err, mpegts) {
		if (err) {
			return callback(err);
		}

		try {
			var mp4 = mpegts_to_mp4(mpegts);
		} catch (err) {
			return callback(err);
		}

		mp4.saveAs(dest, callback);
	});
}

if (module.parent) {
	module.exports = convert;
} else {
	if (process.argv.length < 4) {
		console.log('Usage: mpegts_to_mp4 <src.ts> <dest.ts>');
		process.exit(1);
	}
	
	console.log('Converting...');

	convert(process.argv[2], process.argv[3], function (err) {
		if (err) {
			console.error(err.stack);
		} else {
			console.log('Completed successfully.');
		}
	});
}
