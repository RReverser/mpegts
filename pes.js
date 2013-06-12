(function (exports) {

var PES = {
	Flag: jBinary.Type({
		params: ['dependentField'],
		read: function () {
			return this.binary.read(1);
		},
		write: function (value, context) {
			this.binary.write(1, (this.dependentField in context ? 1 : 0));
		}
	}),

	FlagDependent: jBinary.Type({
		params: ['flagField', 'baseType'],
		read: function () {
			return this.binary.read(['if', this.flagField, this.baseType]);
		},
		write: function () {
			this.binary.write(this.baseType);
		}
	}),

	PESTimeStamp: jBinary.Type({
		init: function (prefix) {
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
			var parts = this.binary.read(this.baseType);
			return parts.loPart | (parts.midPart << 15) | (parts.hiPart << 30);
		},
		write: function (value) {
			this.binary.write(this.baseType, {
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
			(according to specification, it may be written as zero for video streams >=64K length)
			but should work for H.264 streams since NAL unit types always have clear highest bit (`forbidden_zero_bit`)
			*/
			pos += 65536;
			var fileEnd = this.binary.view.byteLength, bytes = this.binary.seek(pos, function () { return this.view.getBytes() });
			for (var i = 0; i < bytes.length - 4; i++) {
				if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1 && (bytes[i + 3] & 0x80)) {
					return pos + i;
				}
			}
			return fileEnd;
		}
	}, jBinary.Type({
		init: function () {
			this.baseType = {
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
				pts: ['FlagDependent', '_hasPTS', ['if', ['_hasDTS'], ['PESTimeStamp', 3], ['PESTimeStamp', 2]]],
				dts: ['FlagDependent', '_hasDTS', ['PESTimeStamp', 1]],
				_toHeaderEnd: function (context) { this.binary.seek(context._headerEnd) }
			};
		},
		read: function () {
			var pos = this.binary.tell();
			try {
				return this.binary.read(this.baseType);
			} catch (e) {
				this.binary.seek(pos);
				this.binary._bitShift = 0;
			}
		}
	}), {
		data: ['blob', function () { return this.binary.getContext('_end')._end - this.binary.tell() }]
	}]
};

if (typeof module !== 'undefined' && exports === module.exports) {
	module.exports = PES;
} else {
	exports.PES = PES;
}

})(this);