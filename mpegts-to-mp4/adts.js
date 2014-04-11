this.ADTS = {
	ADTSPacket: {
		_start: function () { return this.binary.tell() },
		_syncWord: ['const', 12, 0xfff, true],
		version: ['enum', 1, ['mpeg-4', 'mpeg-2']],
		layer: ['const', 2, 0],
		isProtectionAbsent: 1,
		profileMinusOne: 2, // http://wiki.multimedia.cx/index.php?title=MPEG-4_Audio#Audio_Object_Types minus one
		samplingFreq: ['enum', 4, [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]], // http://wiki.multimedia.cx/index.php?title=MPEG-4_Audio#Sampling_Frequencies
		_privateStream: 1,
		channelConfig: 3, // http://wiki.multimedia.cx/index.php?title=MPEG-4_Audio#Channel_Configurations
		_reserved: 4, // originality, home, copyrighted, copyright start bits
		frameLength: 13,
		bufferFullness: 11,
		aacFramesCountMinusOne: 2,
		data: ['blob', function (context) { return context.frameLength - (this.binary.tell() - context._start) }]
	}
};