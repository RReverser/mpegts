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
			return this.binary.read(['if', this.flagField, this.baseType]);
		},
		function () {
			this.binary.write(this.baseType);
		}
	),

	AdaptationField: {
		length: 'uint8',
		_endOf: function () { return this.binary.tell() + this.binary.getContext().length },
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
		extension: ['FlagDependent', '_hasExtension', 'Field'],
		_toEnd: function () { this.binary.seek(this.binary.getContext()._endOf) }
	},

	ES: {
		_rawStream: ['blob', function () { return 188 - (this.binary.tell() % 188) }]
	},

	PrivateSection: ['extend', {
		pointerField: ['if', ['payloadStart', 1], 'uint8'],
		tableId: ['enum', 'uint8', ['PAT', 'CAT', 'PMT']],
		isLongSection: 1,
		isPrivate: 1,
		_reserved: 2,
		_sectionLength: 12
	}, [
		'if',
		['isLongSection'],
		{
			tableIdExt: 'uint16',
			_reserved: 2,
			versionNumber: 5,
			currentNextIndicator: 1,
			sectionNumber: 'uint8',
			lastSectionNumber: 'uint8',

			_dataLength: function () { return this.binary.getContext(1)._sectionLength - 9 },

			data: jBinary.Property(null, function () {
				var data, file = this.binary.getContext(3), header = this.binary.getContext(), dataLength = header._dataLength;

				switch (this.binary.getContext(1).tableId) {
					case 'PAT':
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

					case 'PMT':
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
							var mapping = data.mappings[i];
							file.pmt[mapping.elementaryPID] = mapping;
						}

						break;
				}

				return data;
			}),

			crc32: 'uint32'
		},
		['blob', function () { return this.binary.getContext()._sectionLength }]
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
					return 'ES';
				}
			}
		)],

		_toEnd: function () { this.binary.seek(this.binary.getContext()._startof + 188) }
	},

	File: jBinary.Property(
		function () {
			this.pat = {};
			this.pmt = {};
		},
		function () {
			return this.binary.inContext(this, function () {
				return this.read(['array', 'Packet', this.view.byteLength / 188]);
			});
		},
		function (packets) {
			this.binary.inContext(this, function () {
				this.write(['array', 'Packet'], packets);
			});
		}
	)
}, 'File', 'video/mp2t');

if (typeof module !== 'undefined' && exports === module.exports) {
	module.exports = MPEGTS;
} else {
	exports.MPEGTS = MPEGTS;
}

})(this);