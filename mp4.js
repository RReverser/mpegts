(function (exports) {
var timeBasis = new Date(1970, 0, 1) - new Date(1904, 0, 1);

var MP4 = jBinary.FileFormat({
	FileStructure: jBinary.Property(
		null,
		function () {
			var atomGroups = {}, endOf = this.binary.view.byteLength;
			while (this.binary.tell() < endOf) {
				var item = this.binary.read('AnyBox');
				(atomGroups[item.type] || (atomGroups[item.type] = [])).push(item);
			}
			return atomGroups;
		},
		function (atomGroups) {
			for (var type in atomGroups) {
				var atomGroup = atomGroups[type];
				for (var i = 0, length = atomGroup.length; i < length; i++) {
					this.binary.write('AnyBox', atomGroup[i]);
				}
			}
		}
	),

	ShortName: ['string', 4],
	
	Rate: ['FixedPoint', 'uint32', 16],

	Dimensions: jBinary.Template(
		function (itemType) {
			this.baseType = {
				horz: itemType,
				vert: itemType
			};
		}
	),

	Box: {
		_begin: function () {
			return this.tell();
		},
		_size: jBinary.Property(
			null,
			function () {
				return this.binary.read('uint32');
			},
			function (value) {
				if (value === 0) {
					return this.binary.write('uint32', 0);
				}
				var size = this.binary.getContext().size;
				this.binary.write('uint32', size < Math.pow(2, 32) ? size : 1);
			}
		),
		type: 'ShortName',
		size: jBinary.Property(
			null,
			function () {
				var _size = this.binary.getContext()._size;
				switch (_size) {
					case 0: return this.binary.view.byteLength - this.binary.tell() + 8;
					case 1: return this.binary.read('uint64');
					default: return _size;
				}
			},
			function (value) {
				if (value >= Math.pow(2, 32)) {
					this.binary.write('uint64', value);
				}
			}
		),
		_end: function (context) {
			return context._begin + context.size;
		}
	},

	FullBox: ['extend', 'Box', {
		version: 'uint8',
		flags: 24
	}],

	AnyBox: jBinary.Property(
		null,
		function () {
			var header = this.binary.skip(0, function () {
				return this.read('Box');
			});
			var type = this.binary.structure[header.type];
			if (!type) console.log(header.type);
			var box = type ? this.binary.read(type) : header;
			this.binary.seek(header._end);
			return box;
		},
		function (box) {
			this.binary.write(this.binary.structure[box.type] || 'Box', box);
			this.binary.seek(box._end);
		}
	),

	Time: jBinary.Property(
		['baseType'],
		function () {
			var intTime = this.binary.read(this.baseType);
			if (intTime) {
				return new Date(intTime + timeBasis);
			}
		},
		function (time) {
			this.binary.write(this.baseType, time - timeBasis);
		}
	),

	FixedPoint: jBinary.Property(
		function (baseType, shift) {
			this.baseType = baseType;
			this.coef = 1 << shift;
		},
		function () {
			return this.binary.read(this.baseType) / this.coef;
		},
		function (value) {
			this.binary.write(this.baseType, Math.round(value * this.coef));
		}
	),

	MultiBox: ['extend', 'Box', {
		atoms: jBinary.Property(
			null,
			function () {
				var atoms = {}, end = this.binary.getContext(1)._end;
				while (this.binary.tell() < end) {
					var item = this.binary.read('AnyBox');
					(atoms[item.type] || (atoms[item.type] = [])).push(item);
				}
				return atoms;
			},
			function (atomGroups) {
				for (var type in atomGroups) {
					var atoms = atomGroups[type];
					for (var i = 0, length = atoms.length; i < length; i++) {
						this.binary.write('AnyBox', atoms[i]);
					}
				}
			}
		)
	}],

	TransformationMatrix: {
		a: ['FixedPoint', 'uint32', 16],
		b: ['FixedPoint', 'uint32', 16],
		u: ['FixedPoint', 'uint32', 30],
		c: ['FixedPoint', 'uint32', 16],
		d: ['FixedPoint', 'uint32', 16],
		v: ['FixedPoint', 'uint32', 30],
		x: ['FixedPoint', 'uint32', 16],
		y: ['FixedPoint', 'uint32', 16],
		w: ['FixedPoint', 'uint32', 30]
	},

	Volume: ['FixedPoint', 'uint16', 8],

	FBVersionable: jBinary.Template(
		['type0', 'type1'],
		function (type0, type1) {
			return this.binary.getContext('version').version ? type1 : type0;
		}
	),

	FBUint: ['FBVersionable', 'uint32', 'uint64'],

	FBTime: ['Time', 'FBUint'],

	TimestampBox: ['extend', 'FullBox', {
		creation_time: 'FBTime',
		modification_time: 'FBTime'
	}],

	DurationBox: ['extend', 'TimestampBox', {
		timescale: 'uint32',
		duration: 'FBUint'
	}],

	ftyp: ['extend', 'Box', {
		major_brand: 'ShortName',
		minor_version: 'uint32',
		compatible_brands: ['array', 'ShortName', function () { return (this.binary.getContext(1)._end - this.binary.tell()) / 4 }]
	}],

	free: 'Box',

	mdat: ['extend', 'Box', {
		_rawData: ['blob', function () { return this.binary.getContext(1)._end - this.binary.tell() }]
	}],

	moov: 'MultiBox',

	mvhd: ['extend', 'DurationBox', {
		rate: 'Rate',
		volume: 'Volume',
		_reserved: ['skip', 10],
		matrix: 'TransformationMatrix',
		_reserved2: ['skip', 24],
		next_track_ID: 'uint32'
	}],

	trak: 'MultiBox',

	tkhd: ['extend', 'TimestampBox', {
		track_ID: 'uint32',
		_reserved: ['skip', 4],
		duration: 'FBUint',
		_reserved2: ['skip', 8],
		layer: 'int16',
		alternate_group: 'uint16',
		volume: 'Volume',
		_reserved3: ['skip', 2],
		matrix: 'TransformationMatrix',
		dimensions: ['Dimensions', 'Rate']
	}],

	tref: 'MultiBox',

	TrackReferenceTypeBox: ['extend', 'Box', {
		track_IDs: ['array', 'uint32', function () { return (this.binary.getContext(1)._end - this.binary.tell()) / 4 }]
	}],

	hint: 'TrackReferenceTypeBox',

	cdsc: 'TrackReferenceTypeBox',

	hind: 'TrackReferenceTypeBox',

	mdia: 'MultiBox',

	mdhd: ['extend', 'DurationBox', {
		_padding: 1,
		lang: jBinary.Property(
			function () {
				this.baseType = ['array', 5, 3];
			},
			function () {
				return String.fromCharCode.apply(
					String,
					this.binary.read(this.baseType).map(function (code) { return code + 0x60 })
				);
			},
			function (value) {
				this.binary.write(this.baseType, Array.prototype.map.call(value, function (char) {
					return char.charCodeAt(0) - 0x60;
				}));
			}
		),
		_reserved: ['skip', 2]
	}],

	hdlr: ['extend', 'FullBox', {
		_reserved: ['skip', 4],
		handler_type: ['string', 4],
		_set_handler_type: function (context) {
			this.getContext(atomFilter('trak'))._handler_type = context.handler_type;
		},
		_reserved2: ['skip', 12],
		name: 'string'
	}],

	minf: 'MultiBox',

	vmhd: ['extend', 'FullBox', {
		graphicsmode: 'uint16',
		opcolor: {
			r: 'uint16',
			g: 'uint16',
			b: 'uint16'
		}
	}],

	smhd: ['extend', 'FullBox', {
		balance: ['FixedPoint', 'int16', 8],
		_reserved: ['skip', 2]
	}],

	hmhd: ['extend', 'FullBox', {
		maxPDUsize: 'uint16',
		avgPDUsize: 'uint16',
		maxbitrate: 'uint32',
		avgbitrate: 'uint32',
		_reserved: ['skip', 4]
	}],

	stbl: 'MultiBox',

	SampleEntry: ['extend', 'Box', {
		_reserved: ['skip', 6],
		data_reference_index: 'uint16'
	}],

	btrt: ['extend', 'Box', {
		bufferSizeDB: 'uint32',
		maxBitrate: 'uint32',
		avgBitrate: 'uint32'
	}],

	metx: ['extend', 'SampleEntry', {
		content_encoding: 'string',
		namespace: 'string',
		schema_location: 'string',
		bitratebox: 'btrt'
	}],

	mett: ['extend', 'SampleEntry', {
		content_encoding: 'string',
		mime_format: 'string',
		bitratebox: 'btrt'
	}],

	pasp: ['extend', 'Box', {
		spacing: ['Dimensions', 'uint32']
	}],

	ClapInnerFormat: ['Dimensions', {
		N: 'uint32',
		D: 'uint32'
	}],

	clap: ['extend', 'Box', {
		cleanAperture: 'ClapInnerFormat',
		off: 'ClapInnerFormat'
	}],

	SampleEntryCodecData: {
		codecData: ['blob', function () { return this.binary.getContext(3)._end - this.binary.tell() }]
	},

	VisualSampleEntry: ['extend', 'SampleEntry', {
		_reserved: ['skip', 16],
		dimensions: ['Dimensions', 'uint16'],
		resolution: ['Dimensions', 'Rate'],
		_reserved2: ['skip', 4],
		frame_count: ['const', 'uint16', 1],
		compressorname: jBinary.Property(
			null,
			function () {
				var length = this.binary.read('uint8');
				var name = this.binary.read(['string', length]);
				this.binary.skip(32 - 1 - length);
				return name;
			},
			function (value) {
				if (value.length > 31) value = value.slice(0, 31);
				this.binary.write('uint8', value.length);
				this.binary.write(['string', value.length], value);
				this.binary.skip(32 - 1 - value.length);
			}
		),
		depth: 'uint16',
		_reserved3: ['const', 'uint16', -1]
	}, jBinary.Property(
		function () {
			this.optional = {
				cleanaperture: 'clap',
				pixelaspectratio: 'pasp'
			};
		},
		function () {
			var extension = {};

			for (var propName in this.optional) {
				var type = this.optional[propName];
				var atom = this.binary.skip(0, function () { return this.read('Box') });
				if (atom.type === type) {
					extension[propName] = this.binary.read(type);
				}
			}

			return extension;
		},
		function (box) {
			for (var propName in this.optional) {
				var value = box[propName];
				if (value) {
					this.binary.write(this.optional[propName], value);
				}
			}
		}
	), 'SampleEntryCodecData'],

	AudioSampleEntry: ['extend', 'SampleEntry', {
		_reserved: ['skip', 8],
		channelcount: 'uint16',
		samplesize: 'uint16',
		_reserved2: ['skip', 4],
		samplerate: 'Rate'
	}, 'SampleEntryCodecData'],

	ArrayBox: jBinary.Template(
		function (entryType) {
			this.baseType = ['extend', 'FullBox', {
				entry_count: jBinary.Property(
					null,
					function () {
						return this.binary.read('uint32');
					},
					function () {
						this.binary.write('uint32', this.binary.getContext().entries.length)
					}
				),
				entries: ['array', entryType, function () { return this.binary.getContext().entry_count }]
			}];
		}
	),

	stsd: ['ArrayBox', jBinary.Template(
		function () {
			this.baseType = {soun: 'AudioSampleEntry', vide: 'VisualSampleEntry', meta: 'AnyBox'}[this.binary.getContext(atomFilter('trak'))._handler_type] || 'SampleEntry';
		}
	)],

	stdp: ['extend', 'FullBox', {
		priorities: ['array', 'uint16', function () { return this.binary.getContext(atomFilter('stbl'))._sample_count }]
	}],

	stsl: ['extend', 'FullBox', {
		_reserved: 7,
		constraint_flag: 'bool',
		scale_method: ['enum', 'uint8', [false, 'fill', 'hidden', 'meet', 'slice-x', 'slice-y']],
		display_center: ['Dimensions', 'int16']
	}],

	stts: ['ArrayBox', {
		sample_count: 'uint32',
		sample_delta: 'uint32'
	}],

	ctts: ['ArrayBox', {
		sample_count: 'uint32',
		sample_offset: 'uint32'
	}],

	stss: ['ArrayBox', 'uint32'],

	stsh: ['ArrayBox', {
		shadowed_sample_number: 'uint32',
		sync_sample_number: 'uint32'
	}],

	ExtendedBoolean: ['enum', 2, [undefined, true, false]],

	sdtp: ['extend', 'FullBox', {
		dependencies: ['array', {
			_reserved: 2,
			sample_depends_on: 'ExtendedBoolean',
			sample_is_depended_on: 'ExtendedBoolean',
			sample_has_redundancy: 'ExtendedBoolean'
		}, function () { return this.binary.getContext(atomFilter('stbl'))._sample_count }]
	}],

	edts: 'MultiBox',

	elst: ['ArrayBox', {
		segment_duration: 'FBUint',
		media_time: ['FBVersionable', 'int32', 'int64'],
		media_rate: 'Rate'
	}],

	dinf: 'MultiBox',

	'url ': ['extend', 'FullBox', {
		location: 'string'
	}],

	'urn ': ['extend', 'FullBox', {
		name: 'string',
		location: 'string'
	}],

	dref: ['ArrayBox', 'AnyBox'],

	stsz: ['extend', 'FullBox', {
		sample_size: 'uint32',
		sample_count: 'uint32',
		_sample_count_to_stbl: function (context) {
			this.getContext(atomFilter('stbl'))._sample_count = context.sample_count;
		},
		sample_sizes: [
			'if',
			function () { return !this.binary.getContext().sample_size },
			['array', 'uint32', function () { return this.binary.getContext().sample_count }]
		]
	}],

	stz2: ['extend', 'FullBox', {
		_reserved: ['skip', 3],
		field_size: 'uint8',
		sample_count: 'uint32',
		_sample_count_to_stbl: function (context) {
			this.getContext(atomFilter('stbl'))._sample_count = context.sample_count;
		},
		sample_sizes: ['array', jBinary.Property(
			null,
			function () {
				return this.binary.read(this.binary.getContext().field_size);
			},
			function (value) {
				this.binary.write(this.binary.getContext().field_size, value)
			}
		), function () { return this.binary.getContext().sample_count }]
	}],

	stsc: ['ArrayBox', {
		first_chunk: 'uint32',
		samples_per_chunk: 'uint32',
		sample_description_index: 'uint32'
	}],

	stco: ['ArrayBox', 'uint32'],

	co64: ['ArrayBox', 'uint64'],

	padb: ['extend', 'FullBox', {
		sample_count: 'uint32',
		samples: ['array', {
			_reserved: 1,
			pad: 3
		}, function () { return this.binary.getContext().sample_count }]
	}],

	subs: ['ArrayBox', {
		sample_delta: 'uint32',
		subsample_count: 'uint16',
		subsamples: ['array', {
			subsample_size: ['FBVersionable', 'uint16', 'uint32'],
			subsample_priority: 'uint8',
			discardable: 'uint8',
			_reserved: 'uint32'
		}, function () { return this.binary.getContext().subsample_count }]
	}],

	mvex: 'MultiBox',

	mehd: ['extend', 'FullBox', {
		fragment_duration: 'FBUint'
	}]
}, 'FileStructure');

function atomFilter(type) {
	return function (atom) {
		return atom.type === type;
	};
}

exports.MP4 = MP4;
})(this);
