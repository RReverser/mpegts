(function (exports) {

var PES = {
	Flag: jBinary.Property(
		['dependentField'],
		function () {
			return this.binary.read(1);
		},
		function (value, context) {
			this.binary.write(1, (this.dependentField in context ? 1 : 0));
		}
	),

	FlagDependent: jBinary.Property(
		['flagField', 'baseType'],
		function () {
			return this.binary.read(['if', this.flagField, this.baseType]);
		},
		function () {
			this.binary.write(this.baseType);
		}
	),

	PESTimeStamp: jBinary.Property(
		function (prefix) {
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
		function () {
			var parts = this.binary.read(this.baseType);
			return parts.loPart | (parts.midPart << 15) | (parts.hiPart << 30);
		},
		function (value) {
			this.binary.write(this.baseType, {
				hiPart: value >>> 30,
				midPart: (value >>> 15) & ~(-1 << 15),
				loPart: value & ~(-1 << 15)
			});
		}
	),

	PESHeader: {
		length: 'uint16',
		_marker: ['const', 2, 2],
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
		_end: function (context) { return this.binary.tell() + context.dataLength },
		pts: ['FlagDependent', '_hasPTS', ['if', ['_hasDTS'], ['PESTimeStamp', 3], ['PESTimeStamp', 2]]],
		dts: ['FlagDependent', '_hasDTS', ['PESTimeStamp', 1]],
		_toEnd: function (context) { this.binary.seek(context._end) }
	}
};

if (typeof module !== 'undefined' && exports === module.exports) {
	module.exports = PES;
} else {
	exports.PES = PES;
}

})(this);