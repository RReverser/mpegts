this.PES = {
	Flag: jBinary.Template({
		baseType: 1,
		params: ['dependentField'],
		write: function (value, context) {
			this.baseWrite(this.dependentField in context ? 1 : 0);
		}
	}),

	FlagDependent: jBinary.Template({
		params: ['flagField', 'baseType'],
		read: function () {
			return this.binary.read(['if', this.flagField, this.baseType]);
		}
	}),

	PESTimeStamp: jBinary.Template({
		setParams: function (prefix) {
			var skipBit = ['const', 1, 1, true];
			this.baseType = {
				_prefix: ['const', 4, prefix, true],
				hiPart: 3,
				_skip1: skipBit,
				midPart: 15,
				_skip2: skipBit,
				loPart: 15,
				_skip3: skipBit
			};
		},
		read: function () {
			var parts = this.baseRead();
			return parts.loPart | (parts.midPart << 15) | (parts.hiPart << 30);
		},
		write: function (value) {
			this.baseWrite({
				hiPart: value >>> 30,
				midPart: (value >>> 15) & ~(-1 << 15),
				loPart: value & ~(-1 << 15)
			});
		}
	}),

	PESPacket: ['extend', {
		_startCode0: ['const', 'uint8', 0, true],
		_startCode1: ['const', 'uint8', 0, true],
		_startCode2: ['const', 'uint8', 1, true],
		streamId: 'uint8',
		length: 'uint16',
		_end: function (context) {
			var pos = this.binary.tell(), length = context.length;

			if (length) {
				return pos + length;
			}

			/*
			not sure if it correctly covers cases where `length`==0
			(according to specification, it may be written as zero for video streams of undefined length)
			but should work for H.264 streams since NAL unit types always have clear highest bit (`forbidden_zero_bit`)
			*/
			var fileEnd = this.binary.view.byteLength, bytes = this.binary.seek(pos, function () { return this.view.getBytes() });
			for (var i = 0; i < bytes.length - 4; i++) {
				if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1 && (bytes[i + 3] & 0x80)) {
					return pos + i;
				}
			}
			return fileEnd;
		}
	}, jBinary.Template({
		baseType: {
			_marker: ['const', 2, 2, true],
			scramblingControl: ['enum', 2, ['not_scrambled']],
			priority: 1,
			dataAlignmentIndicator: 1,
			hasCopyright: 1,
			isOriginal: 1,
			_hasPTS: ['Flag', 'pts'],
			_hasDTS: ['Flag', 'dts'],
			_hasESCR: ['Flag', 'escr'],
			_hasESRate: ['Flag', 'esRate'],
			dsmTrickMode: 1,
			_hasAdditionalCopyInfo: ['Flag', 'additionalCopyInfo'],
			_hasPESCRC: ['Flag', 'pesCRC'],
			_hasExtension: ['Flag', 'extension'],
			dataLength: 'uint8',
			_headerEnd: function (context) { return this.binary.tell() + context.dataLength },
			pts: ['FlagDependent', '_hasPTS', ['if', '_hasDTS', ['PESTimeStamp', 3], ['PESTimeStamp', 2]]],
			dts: ['FlagDependent', '_hasDTS', ['PESTimeStamp', 1]],
			_toHeaderEnd: function (context) { this.binary.seek(context._headerEnd) }
		},
		read: function () {
			var pos = this.binary.tell();
			try {
				return this.baseRead();
			} catch (e) {
				this.binary.seek(pos);
				this.binary.view.alignBy();
			}
		}
	}), {
		data: ['blob', function () { return this.binary.getContext('_end')._end - this.binary.tell() }]
	}]
};