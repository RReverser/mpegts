(function (exports) {

var MPEGTS = jBinary.FileFormat({
	PCR: {
		pts: 33,
		_reserved: 6,
		extension: 9
	},

	DynamicArray: jBinary.Property(
		['lengthType', 'itemType'],
		function () {
			var length = this.binary.read(this.lengthType);
			return this.binary.read(['array', this.itemType, length]);
		},
		function (array) {
			this.binary.write(this.lengthType, array.length);
			this.binary.write(['array', this.itemType], array);
		}
	),

	Field: ['DynamicArray', 'uint8', 'uint8'],

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
		_hasPCR: ['Flag', 'pcr'],
		_hasOPCR: ['Flag', 'opcr'],
		_hasSplicingPoint: ['Flag', 'spliceCountdown'],
		_hasTransportPrivateData: ['Flag', 'privateData'],
		_hasExtension: ['Flag', 'extension'],
		pcr: ['FlagDependent', '_hasPCR', 'PCR'],
		opcr: ['FlagDependent', '_hasOPCR', 'PCR'],
		spliceCountdown: ['FlagDependent', '_hasSplicingPoint', 'uint8'],
		privateData: ['FlagDependent', '_hasTransportPrivateData', 'Field'],
		extension: ['FlagDependent', '_hasExtension', 'Field']
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

	PrivateSection: ['extend', {
		pointerField: ['if', function () { return this.binary.getContext(1).payloadStart }, 'uint8'],
		tableId: 'uint8',
		isLongSection: 1,
		isPrivate: 1,
		_reserved: 2,
		sectionLength: 12
	}, [
		'if',
		function () { return this.binary.getContext().isLongSection },
		{
			tableIdExt: 'uint16',
			_reserved: 2,
			versionNumber: 5,
			currentNextIndicator: 1,
			sectionNumber: 'uint8',
			lastSectionNumber: 'uint8',

			dataLength: function () { return this.binary.getContext(1).sectionLength - 9 },

			data: jBinary.Property(null, function () {
				var data, file = this.binary.getContext(3), header = this.binary.getContext(), dataLength = header.dataLength;

				switch (this.binary.getContext(1).tableId) {
					case 0:
						data = this.binary.read(['array', {
							programNumber: 'uint16',
							_reserved: 3,
							pid: 13
						}, dataLength / 4]);

						if (header.sectionNumber == 0) {
							file.pat = {};
						}

						for (var i = 0; i < data.length; i++) {
							file.pat[data[i].pid] = data[i];
						}

						break;

					case 2:
						data = this.binary.read({
							_reserved: 3,
							pcrPID: 13,
							_reserved2: 4,
							programDescriptors: ['DynamicArray', 12, 'uint8']
						});

						data.mappings = [];

						dataLength -= 4 + data.programDescriptors.length;

						while (dataLength > 0) {
							var mapping = this.binary.read({
								streamType: 'uint8',
								_reserved: 3,
								elementaryPID: 13,
								_reserved2: 4,
								esInfo: ['DynamicArray', 12, 'uint8']
							});
							data.mappings.push(mapping);

							dataLength -= 5 + mapping.esInfo.length;
						}

						if (header.sectionNumber == 0) {
							file.pmt = {};
						}

						for (var i = 0; i < data.mappings.length; i++) {
							file.pmt[data.mappings[i].elementaryPID] = data.mappings[i];
						}

						break;

					default:
						data = this.binary.read(['blob', dataLength]);
						break;
				}

				return data;
			}),

			crc32: 'uint32'
		},
		['blob', function () { return this.binary.getContext().sectionLength }]
	]],

	Packet: {
		_startof: function () { return this.binary.tell() },

		_syncByte: ['const', 'uint8', 0x47, true],

		transportError: 1,
		payloadStart: 1,
		transportPriority: 1,
		pid: 13,

		scramblingControl: 2,
		_hasAdaptationField: ['Flag', 'adaptationField'],
		_hasPayload: ['Flag', 'payload'],
		contCounter: 4,

		adaptationField: ['FlagDependent', '_hasAdaptationField', 'AdaptationField'],

		payload: ['FlagDependent', '_hasPayload', jBinary.Template(
			null,
			function () {
				var pid = this.binary.getContext().pid, file = this.binary.getContext(1);
				if (pid < 2 || pid in file.pat) {
					return 'PrivateSection';
				}
				if (pid in file.pmt) {
					return this.binary.getContext().payloadStart ? 'PES' : ['blob', function () { return 188 - (this.binary.tell() - this.binary.getContext()._startof) }];
				}
			}
		)],

		_skip: ['skip', function () { return 188 - (this.binary.tell() - this.binary.getContext()._startof) }]
	},

	File: jBinary.Property(
		function () {
			this.pat = {};
			this.pmt = {};
		},
		function () {
			return this.binary.inContext(this, function () {
				return this.read(['array', 'Packet', 5/*this.view.byteLength / 188*/]);
			});
		},
		function (packets) {
			this.binary.inContext(this, function () {
				this.write(['array', 'Packet'], packets);
			});
		}
	)
}, 'File');

if (typeof module !== 'undefined' && exports === module.exports) {
	module.exports = MPEGTS;
} else {
	exports.MPEGTS = MPEGTS;
}

})(this);