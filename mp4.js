(function (exports) {
var timeBasis = new Date(1970, 0, 1) - new Date(1904, 0, 1);

function toValue(prop, val) {
	return val instanceof Function ? val.call(prop) : val;
}

var MP4 = jBinary.FileFormat({
	ShortName: ['string', 4],
	
	Rate: ['FixedPoint', 'int32', 16],

	Dimensions: jBinary.Template(
		function (itemType) {
			this.baseType = {
				horz: itemType,
				vert: itemType
			};
		}
	),

	BoxHeader: {
		_begin: function () {
			return this.binary.tell();
		},
		_size: jBinary.Property(
			null,
			function () {
				return this.binary.read('uint32');
			},
			function () {
				var size = this.binary.getContext().size;
				if (!size) {
					return this.binary.write('uint32', 0);
				}
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
		_end: jBinary.Property(
			null,
			function () {
				var context = this.binary.getContext();
				return context._begin + context.size;
			}
		)
	},

	FullBox: ['extend', 'BoxHeader', {
		version: 'uint8',
		flags: 24
	}],

	Box: jBinary.Property(
		null,
		function () {
			var header = this.binary.skip(0, function () {
				return this.read('BoxHeader');
			});
			var box = header.type in this.binary.structure ? this.binary.read(header.type) : header;
			if (box === header) console.log(header.type);
			this.binary.seek(header._end);
			return box;
		},
		function (box) {
			this.binary.write(box.type in this.binary.structure ? box.type : 'BoxHeader', box);
			var size = this.binary.tell() - box._begin;
			this.binary.seek(box._begin, function () {
				this.write('uint32', size);
			});
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
			this.binary.write(this.baseType, value * this.coef);
		}
	),

	Atoms: jBinary.Property(
		['end'],
		function () {
			var atoms = {}, end = toValue(this, this.end) || this.binary.getContext('_end')._end;
			while (this.binary.tell() < end) {
				var item = this.binary.read('Box');
				(atoms[item.type] || (atoms[item.type] = [])).push(item);
			}
			return atoms;
		},
		function (parent) {
			for (var type in parent) {
				var atoms = parent[type];
				for (var i = 0, length = atoms.length; i < length; i++) {
					atoms[i].type = type;
					this.binary.write('Box', atoms[i]);
				}
			}
		}
	),

	ChildAtoms: {
		atoms: 'Atoms'
	},

	MultiBox: ['extend', 'BoxHeader', 'ChildAtoms'],

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
		function (type0, type1) {
			this.baseType = ['if', 'version', type1, type0];
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

	ftyp: ['extend', 'BoxHeader', {
		major_brand: 'ShortName',
		minor_version: 'uint32',
		compatible_brands: ['array', 'ShortName', function () { return (this.binary.getContext(1)._end - this.binary.tell()) / 4 }]
	}],

	free: 'BoxHeader',

	RawData: {
		_rawData: ['blob', function () { return this.binary.getContext('_end')._end - this.binary.tell() }]
	},

	mdat: ['extend', 'BoxHeader', 'RawData'],

	ParamSets: jBinary.Template(
		function (numType) {
			this.baseType = ['DynamicArray', numType, jBinary.Property(
				null,
				function () {
					var length = this.binary.read('uint16');
					return this.binary.read(['blob', length]);
				},
				function (paramSet) {
					this.binary.write('uint16', paramSet.length);
					this.binary.write('blob', paramSet);
				}
			)];
		}
	),

	avcC: ['extend', 'BoxHeader', {
		version: ['const', 'uint8', 1],
		profileIndication: 'uint8',
		profileCompatibility: 'uint8',
		levelIndication: 'uint8',
		_reserved: ['const', 6, -1],
		lengthSizeMinusOne: 2,
		_reserved2: ['const', 3, -1],
		seqParamSets: ['ParamSets', 5],
		pictParamSets: ['ParamSets', 'uint8']
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

	TrackReferenceTypeBox: ['extend', 'BoxHeader', {
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
		_set_handler_type: function () {
			this.binary.getContext(atomFilter('trak'))._handler_type = this.binary.getContext().handler_type;
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

	SampleEntry: ['extend', 'BoxHeader', {
		_reserved: ['skip', 6],
		data_reference_index: 'uint16'
	}],

	btrt: ['extend', 'BoxHeader', {
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

	pasp: ['extend', 'BoxHeader', {
		spacing: ['Dimensions', 'uint32']
	}],

	ClapInnerFormat: ['Dimensions', {
		N: 'uint32',
		D: 'uint32'
	}],

	clap: ['extend', 'BoxHeader', {
		cleanAperture: 'ClapInnerFormat',
		off: 'ClapInnerFormat'
	}],

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
				var atom = this.binary.skip(0, function () { return this.read('BoxHeader') });
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
	), 'ChildAtoms'],

	AudioSampleEntry: ['extend', 'SampleEntry', {
		_reserved: ['skip', 8],
		channelcount: 'uint16',
		samplesize: 'uint16',
		_reserved2: ['skip', 4],
		samplerate: 'Rate'
	}, 'RawData'],

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

	ArrayBox: jBinary.Template(
		function (entryType) {
			this.baseType = ['extend', 'FullBox', {
				entries: ['DynamicArray', 'uint32', entryType]
			}];
		}
	),

	stsd: ['ArrayBox', jBinary.Property(
		function () {
			this.baseType = {soun: 'AudioSampleEntry', vide: 'VisualSampleEntry', meta: 'Box'}[this.binary.getContext(atomFilter('trak'))._handler_type] || 'SampleEntry';
		},
		function () {
			return this.binary.read(this.baseType);
		},
		function (value) {
			var pos = this.binary.tell();
			this.binary.write(this.baseType, value);
			var size = this.binary.tell() - pos;
			this.binary.seek(pos, function () { this.write('uint32', size) });
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

	dref: ['ArrayBox', 'Box'],

	stsz: ['extend', 'FullBox', {
		sample_size: 'uint32',
		sample_count: 'uint32',
		_sample_count_to_stbl: function () {
			this.binary.getContext(atomFilter('stbl'))._sample_count = this.binary.getContext().sample_count;
		},
		sample_sizes: [
			'if_not',
			['sample_size'],
			['array', 'uint32', function () { return this.binary.getContext().sample_count }]
		]
	}],

	stz2: ['extend', 'FullBox', {
		_reserved: ['skip', 3],
		field_size: 'uint8',
		sample_count: 'uint32',
		_sample_count_to_stbl: function () {
			this.binary.getContext(atomFilter('stbl'))._sample_count = this.binary.getContext().sample_count;
		},
		sample_sizes: [
			'array',
			jBinary.Template(null, function () { return this.binary.getContext().field_size }),
			function () { return this.binary.getContext().sample_count }
		]
	}],

	stsc: ['ArrayBox', {
		first_chunk: 'uint32',
		samples_per_chunk: 'uint32',
		sample_description_index: 'uint32'
	}],

	stco: ['ArrayBox', 'uint32'],

	co64: ['ArrayBox', 'uint64'],

	padb: ['extend', 'FullBox', {
		pads: ['DynamicArray', 'uint32', jBinary.Property(
			null,
			function () {
				this.binary.read(1);
				return this.binary.read(3);
			},
			function (pad) {
				this.binary.write(1, 0);
				this.binary.write(3, pad);
			}
		)]
	}],

	subs: ['ArrayBox', {
		sample_delta: 'uint32',
		subsamples: ['DynamicArray', 'uint16', {
			subsample_size: ['FBVersionable', 'uint16', 'uint32'],
			subsample_priority: 'uint8',
			discardable: 'uint8',
			_reserved: ['skip', 4]
		}]
	}],

	mvex: 'MultiBox',

	mehd: ['extend', 'FullBox', {
		fragment_duration: 'FBUint'
	}]
}, ['Atoms', function () { return this.binary.view.byteLength }], 'video/mp4');

function atomFilter(type) {
	return function (atom) {
		return atom.type === type;
	};
}

if (typeof module !== 'undefined' && exports === module.exports) {
	module.exports = MP4;
} else {
	exports.MP4 = MP4;
}

})(this);
