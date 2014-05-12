this.MPEGTS = {
	PCR: {
		pts: 33,
		_reserved: 6,
		extension: 9
	},

	DynamicArray: jBinary.Template({
		setParams: function (lengthType, itemType) {
			this.baseType = {
				length: lengthType,
				array: ['array', itemType, 'length']
			};
		},
		read: function () {
			return this.baseRead().array;
		},
		write: function (array) {
			this.baseWrite({
				length: array.length,
				array: array
			});
		}
	}),

	Field: ['DynamicArray', 'uint8', 'uint8'],

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

	AdaptationField: {
		length: 'uint8',
		_endOf: function (context) { return this.binary.tell() + context.length },
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
		_toEnd: function (context) { this.binary.seek(context._endOf) }
	},

	ES: {
		_rawStream: ['blob', function () { return this.binary.getContext(1)._endof - this.binary.tell() }]
	},

	PATItem: ['array', {
		programNumber: 'uint16',
		_reserved: 3,
		pid: 13
	}, function (context) { return context._dataLength / 4 }],

	PMTHeader: {
		_reserved: 3,
		pcrPID: 13,
		_reserved2: 4,
		programDescriptors: ['DynamicArray', 12, 'uint8']
	},

	PMTItem: {
		streamType: 'uint8',
		_reserved: 3,
		elementaryPID: 13,
		_reserved2: 4,
		esInfo: ['DynamicArray', 12, 'uint8']
	},

	PrivateSection: ['extend', {
		pointerField: ['if', 'payloadStart', 'uint8'],
		tableId: ['enum', 'uint8', ['PAT', 'CAT', 'PMT']],
		isLongSection: 1,
		isPrivate: 1,
		_reserved: 2,
		_sectionLength: 12
	}, ['if', 'isLongSection', {
			tableIdExt: 'uint16',
			_reserved: 2,
			versionNumber: 5,
			currentNextIndicator: 1,
			sectionNumber: 'uint8',
			lastSectionNumber: 'uint8',

			_dataLength: function () { return this.binary.getContext(1)._sectionLength - 9 },

			data: jBinary.Type({
				read: function (header) {
					var data, file = this.binary.getContext(3), dataLength = header._dataLength;

					switch (this.binary.getContext(1).tableId) {
						case 'PAT':
							data = this.binary.read('PATItem');

							if (header.sectionNumber == 0) {
								file.pat = {};
							}

							for (var i = 0; i < data.length; i++) {
								file.pat[data[i].pid] = data[i];
							}

							break;

						case 'PMT':
							data = this.binary.read('PMTHeader');

							data.mappings = [];

							dataLength -= 4 + data.programDescriptors.length;

							while (dataLength > 0) {
								var mapping = this.binary.read('PMTItem');
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
				}
			}),

			crc32: 'uint32'
		},
		['blob', '_sectionLength']
	]],

	Packet: {
		_startof: function () { return this.binary.tell() },
		_endof: function (context) { return context._startof + 188 },

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

		payload: ['FlagDependent', '_hasPayload', jBinary.Template({
			getBaseType: function (context) {
				var pid = context.pid, file = this.binary.getContext(1);
				if (pid < 2 || pid in file.pat) {
					return 'PrivateSection';
				}
				if (pid in file.pmt) {
					return 'ES';
				}
			}
		})],

		_toEnd: function (context) { this.binary.seek(context._endof) }
	},

	File: jBinary.Template({
		baseType: ['array', 'Packet'],
		read: function () {
			this.pat = {};
			this.pmt = {};
			var self = this;
			return this.binary.inContext(this, function () {
				return self.baseRead();
			});
		},
		write: function (packets) {
			var self = this;
			this.binary.inContext(this, function () {
				self.baseWrite(packets);
			});
		}
	})
};