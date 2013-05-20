(function (exports) {

var MPEGTS = jBinary.FileFormat({
	PCR: jBinary.Property(
		function () {
			this.baseType = {
				base: 33,
				_reserved: 6,
				extension: 9
			};
		},
		function () {
			var pcr = this.binary.read(this.baseType);
			return 300 * (300 * pcr.base + pcr.extension);
		},
		function (time) {
			time /= 300;
			this.binary.write(this.baseType, {
				base: time / 300,
				extension: time % 300
			});
		}
	),

	Field: {
		length: 'uint8',
		data: ['blob', function () { return this.binary.getContext().length }]
	},

	Flag: jBinary.Property(
	    ['dependentField'],
		function () {
			return this.binary.read(1);
		},
		function () {
			this.binary.write(1, (this.dependentField in this.binary.getContext() ? 1 : 0));
		}
	),

	FlagDependent: jBinary.Property(
		['flagField', 'baseType'],
		function () {
			if (this.binary.getContext()[this.flagField]) {
				return this.binary.read(this.baseType);
			}
		},
		function () {
			this.binary.write(this.baseType);
		}
	),

	AdaptationField: {
		length: 'uint8',
		discontinuity: 1,
		randomAccess: 1,
		priority: 1,
		hasPCR: ['Flag', 'pcr'],
		hasOPCR: ['Flag', 'opcr'],
		hasSplicingPoint: ['Flag', 'spliceCountdown'],
		hasTransportPrivateData: ['Flag', 'privateData'],
		hasExtension: ['Flag', 'extension'],
		pcr: ['FlagDependent', 'hasPCR', 'PCR'],
		opcr: ['FlagDependent', 'hasOPCR', 'PCR'],
		spliceCountdown: ['FlagDependent', 'hasSplicingPoint', 'uint8'],
		privateData: ['FlagDependent', 'hasTransportPrivateData', 'Field'],
		extension: ['FlagDependent', 'hasExtension', 'Field']
	},

	PES: {
		_prefix0: ['const', 'uint8', 0x00, true],
		_prefix1: ['const', 'uint8', 0x00, true],
		_prefix2: ['const', 'uint8', 0x01, true],
		streamId: 'uint8',
		length: jBinary.Property(
			null,
			function () {
				return this.binary.read('uint16') || (188 - (this.binary.tell() % 188));
			},
			function (value) {
				this.binary.write('uint16', value);
			}
		),
		_beforeExtension: function () { return this.binary.tell() },
		extension: [
			'if',
			function () {
				var streamId = this.binary.getContext().streamId;
				return !(streamId == 0xBE || streamId == 0xBF);
			},
			{
					_prefix: ['const', 2, 2],
					scramblingControl: 2,
					priority: 1,
					dataAlignment: 1,
					hasCopyright: 1,
					isOriginal: 1,
					ptsdts: 2,
					hasESCR: 1,
					hasESRate: 1,
					dsmTrickMode: 1,
					extraCopyInfo: 1,
					hasPESCRC: 1,
					hasPESExtension: 1,
					length: 'uint8',
					_skip: ['skip', function () { return this.binary.getContext().length }]
			}
		],
		elementaryStream: ['blob', function () {
			var context = this.binary.getContext();
			return context.length - (this.binary.tell() - context._beforeExtension);
		}]
	},

	PrivateSection: {
		pointerField: ['if', tsHeader.payloadStart, 'uint8'],
		tableId: 'uint8',
		isLongSection: 1,
		isPrivate: 1,
		_reserved: 2,
		sectionLength: 12,

		data: function () {
			if (!this.current.isLongSection) {
				return this.parse(['blob', this.current.sectionLength]);
			}

			var header = this.parse({
				tableIdExt: 'uint16',
				_reserved: 2,
				versionNumber: 5,
				currentNextIndicator: 1,
				sectionNumber: 'uint8',
				lastSectionNumber: 'uint8'
			});

			var dataLength = this.current.sectionLength - 9, data;

			switch (this.current.tableId) {
				case 0:
					data = this.parse(['array', {
						programNumber: 'uint16',
						_reserved: 3,
						pid: 13
					}, dataLength / 4]);

					if (header.sectionNumber == 0) {
						mpegts.pat = {};
					}

					for (var i = 0; i < data.length; i++) {
						mpegts.pat[data[i].pid] = data[i];
					}

					break;

				case 2:
					data = this.parse({
						_reserved: 3,
						pcrPID: 13,
						_reserved2: 4,
						programInfoLength: 12
					});

					data.programDescriptors = this.parse(['blob', data.programInfoLength]);
					data.mappings = [];

					dataLength -= 4 + data.programInfoLength;

					while (dataLength > 0) {
						var mapping = this.parse({
							streamType: 'uint8',
							_reserved: 3,
							elementaryPID: 13,
							_reserved2: 4,
							esInfoLength: 12
						});
						mapping.esInfo = this.parse(['blob', mapping.esInfoLength]);
						data.mappings.push(mapping);

						dataLength -= 5 + mapping.esInfoLength;
					}

					if (header.sectionNumber == 0) {
						mpegts.pmt = {};
					}

					for (var i = 0; i < data.mappings.length; i++) {
						mpegts.pmt[data.mappings[i].elementaryPID] = data.mappings[i];
					}

					break;

				default:
					data = this.parse(['blob', dataLength]);
					break;
			}

			var crc32 = this.parse('uint32');

			return {
				header: header,
				data: data,
				crc32: crc32
			};
		}
	},

	Packet: function (mpegts) {
		return this.parse({
			_startof: function () { return this.binary.tell() },

			_syncByte: ['const', 'uint8', 0x47, true],

			transportError: 1,
			payloadStart: 1,
			transportPriority: 1,
			pid: 13,

			scramblingControl: 2,
			hasAdaptationField: ['Flag', 'adaptationField'],
			hasPayload: ['Flag', 'payload'],
			contCounter: 4,

			adaptationField: ['FlagDependent', 'hasAdaptationField', 'AdaptationField'],

			payload: ['FlagDependent', 'hasPayload', function () {
				if (this.current.header.pid < 2 || this.current.header.pid in mpegts.pat) {
					return this.parse(['TSPrivateSection', mpegts, this.current.header]);
				}
				if (this.current.header.payloadStart && this.current.header.pid in mpegts.pmt) {
					return this.parse('PES');
				}
			}],

			_skip: ['skip', function () { return 188 - (this.binary.tell() - this.binary.getContext()._startof) }]
		});
	}
}, 'Packet');

if (typeof module !== 'undefined' && exports === module.exports) {
	module.exports = MPEGTS;
} else {
	exports.MPEGTS = MPEGTS;
}

})(this);