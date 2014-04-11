(function () {

var timeBasis = new Date(1970, 0, 1) - new Date(1904, 0, 1);

function atomFilter(type) {
	return function (atom) {
		return atom.type === type;
	};
}

this.MP4 = {
	ShortName: ['string0', 4],
	
	Rate: ['FixedPoint', 'int32', 16],

	Dimensions: jBinary.Template({
		setParams: function (itemType) {
			this.baseType = {
				horz: itemType,
				vert: itemType
			};
		}
	}),

	BoxHeader: {
		_begin: function () {
			return this.binary.tell();
		},
		_size: jBinary.Template({
			baseType: 'uint32',
			write: function (value, context) {
				var size = context.size;
				this.baseWrite(size ? (size < Math.pow(2, 32) ? size : 1) : 0);
			}
		}),
		type: 'ShortName',
		size: jBinary.Type({
			read: function (context) {
				var _size = context._size;
				switch (_size) {
					case 0: return this.binary.view.byteLength - this.binary.tell() + 8;
					case 1: return this.binary.read('uint64');
					default: return _size;
				}
			},
			write: function (value) {
				if (value >= Math.pow(2, 32)) {
					this.binary.write('uint64', value);
				}
			}
		}),
		_end: function (context) {
			return context._begin + context.size;
		}
	},

	FullBox: ['extend', 'BoxHeader', {
		version: 'uint8',
		flags: 24
	}],

	Box: jBinary.Type({
		read: function () {
			var header = this.binary.skip(0, function () {
				return this.read('BoxHeader');
			});
			var box = this.binary.read(header.type) || header;
			if (box === header) console.log(header.type);
			this.binary.seek(header._end);
			return box;
		},
		write: function (box) {
			this.binary.write(box.type, box);
			var size = this.binary.tell() - box._begin;
			this.binary.seek(box._begin, function () {
				this.write('uint32', size);
			});
		}
	}),

	Time: jBinary.Template({
		params: ['baseType'],
		read: function () {
			var intTime = this.baseRead();
			if (intTime) {
				return new Date(intTime + timeBasis);
			}
		},
		write: function (time) {
			this.baseWrite(time - timeBasis);
		}
	}),

	FixedPoint: jBinary.Template({
		params: ['baseType'],
		setParams: function (baseType, shift) {
			this.coef = 1 << shift;
		},
		read: function () {
			return this.baseRead() / this.coef;
		},
		write: function (value) {
			this.baseWrite(value * this.coef);
		}
	}),

	Atoms: jBinary.Type({
		params: ['end'],
		read: function () {
			var atoms = {}, end = this.toValue(this.end) || this.binary.getContext('_end')._end;
			while (this.binary.tell() < end) {
				var item = this.binary.read('Box');
				(atoms[item.type] || (atoms[item.type] = [])).push(item);
			}
			return atoms;
		},
		write: function (parent) {
			for (var type in parent) {
				var atoms = parent[type];
				for (var i = 0, length = atoms.length; i < length; i++) {
					atoms[i].type = type;
					this.binary.write('Box', atoms[i]);
				}
			}
		}
	}),

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

	FBVersionable: jBinary.Template({
		setParams: function (type0, type1) {
			this.baseType = ['if', 'version', type1, type0];
		}
	}),

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

	ParamSets: jBinary.Template({
		setParams: function (numType) {
			this.baseType = ['DynamicArray', numType, jBinary.Template({
				baseType: {
					length: 'uint16',
					paramSet: ['blob', 'length']
				},
				read: function () {
					return this.baseRead().paramSet;
				},
				write: function (paramSet) {
					this.baseWrite({
						length: paramSet.length,
						paramSet: paramSet
					});
				}
			})];
		}
	}),

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
		lang: jBinary.Type({
			read: function () {
				return String.fromCharCode.apply(
					String,
					this.binary.read(['array', 5, 3]).map(function (code) { return code + 0x60 })
				);
			},
			write: function (value) {
				for (var i = 0; i < 3; i++) {
					this.binary.write(5, value.charCodeAt(i) - 0x60);
				}
			}
		}),
		_reserved: ['skip', 2]
	}],

	hdlr: ['extend', 'FullBox', {
		_reserved: ['skip', 4],
		handler_type: 'ShortName',
		_set_handler_type: function (context) {
			this.binary.getContext(atomFilter('trak'))._handler_type = context.handler_type;
		},
		_reserved2: ['skip', 12],
		name: 'string0'
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
		content_encoding: 'string0',
		namespace: 'string0',
		schema_location: 'string0',
		bitratebox: 'btrt'
	}],

	mett: ['extend', 'SampleEntry', {
		content_encoding: 'string0',
		mime_format: 'string0',
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
		compressorname: jBinary.Template({
			baseType: {
				length: 'uint8',
				string: ['string', 'length'],
				_skip: ['skip', function (context) { return 32 - 1 - context.length }]
			},
			read: function () {
				return this.baseRead().string;
			},
			write: function (value) {
				this.baseWrite({
					length: value.length,
					string: value
				});
			}
		}),
		depth: 'uint16',
		_reserved3: ['const', 'uint16', -1]
	}, jBinary.Type({
		setParams: function () {
			this.optional = {
				cleanaperture: 'clap',
				pixelaspectratio: 'pasp'
			};
		},
		read: function () {
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
		write: function (box) {
			for (var propName in this.optional) {
				var value = box[propName];
				if (value) {
					this.binary.write(this.optional[propName], value);
				}
			}
		}
	}), 'ChildAtoms'],

	AudioSampleEntry: ['extend', 'SampleEntry', {
		_reserved: ['skip', 8],
		channelcount: 'uint16',
		samplesize: 'uint16',
		_reserved2: ['skip', 4],
		samplerate: 'Rate'
	}, 'ChildAtoms'],

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

	ArrayBox: jBinary.Template({
		setParams: function (entryType) {
			this.baseType = ['extend', 'FullBox', {
				entries: ['DynamicArray', 'uint32', entryType]
			}];
		}
	}),

	stsd: ['ArrayBox', jBinary.Template({
		getBaseType: function () {
			return {soun: 'AudioSampleEntry', vide: 'VisualSampleEntry', meta: 'Box'}[this.binary.getContext(atomFilter('trak'))._handler_type] || 'SampleEntry';
		},
		write: function (value) {
			var pos = this.binary.tell();
			this.baseWrite(value);
			var size = this.binary.tell() - pos;
			this.binary.seek(pos, function () { this.write('uint32', size) });
		}
	})],

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
		location: 'string0'
	}],

	'urn ': ['extend', 'FullBox', {
		name: 'string0',
		location: 'string0'
	}],

	dref: ['ArrayBox', 'Box'],

	stsz: ['extend', 'FullBox', {
		sample_size: 'uint32',
		sample_count: 'uint32',
		_sample_count_to_stbl: function (context) {
			this.binary.getContext(atomFilter('stbl'))._sample_count = context.sample_count;
		},
		sample_sizes: ['if_not', 'sample_size',
			['array', 'uint32', 'sample_count']
		]
	}],

	stz2: ['extend', 'FullBox', {
		_reserved: ['skip', 3],
		field_size: 'uint8',
		sample_count: 'uint32',
		_sample_count_to_stbl: function (context) {
			this.binary.getContext(atomFilter('stbl'))._sample_count = context.sample_count;
		},
		sample_sizes: [
			'array',
			jBinary.Template({
				getBaseType: function (context) { return context.field_size }
			}),
			'sample_count'
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
		pads: ['DynamicArray', 'uint32', jBinary.Template({
			baseType: {
				_skip: ['const', 1, 0],
				pad: 3
			},
			read: function () {
				return this.baseRead().pad;
			},
			write: function (pad) {
				this.baseWrite({pad: pad});
			}
		})]
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
	}],

	esds_section: ['extend', {
		descriptor_type: 'uint8',
		ext_type: jBinary.Type({
			read: function () {
				var next_byte = this.binary.read('uint8');
				if (next_byte === 0x80 || next_byte === 0x81 || next_byte === 0xFE) {
					this.binary.skip(2);
					return next_byte;
				} else {
					this.binary.skip(-1);
				}
			},
			write: function (filler) {
				if (filler !== undefined) this.binary.write('blob', [filler, filler, filler]);
			}
		}),
		length: 'uint8'
	}, jBinary.Template({
		getBaseType: function (context) {
			switch (context.descriptor_type) {
				case 3: return {
					es_id: 'uint16',
					stream_priority: 'uint8'
				};

				case 4: return {
					type: ['enum', 'uint8', {
						1: 'v1',
						2: 'v2',
						32: 'mpeg4_video',
						33: 'mpeg4_avc_sps',
						34: 'mpeg4_avc_pps',
						64: 'mpeg4_audio',
						96: 'mpeg2_simple_video',
						97: 'mpeg2_main_video',
						98: 'mpeg2_snr_video',
						99: 'mpeg2_spatial_video',
						100: 'mpeg2_high_video',
						101: 'mpeg2_422_video',
						102: 'mpeg4_adts_main',
						103: 'mpeg4_adts_low_complexity',
						104: 'mpeg4_adts_scaleable_sampling',
						105: 'mpeg2_adts_main',
						106: 'mpeg1_video',
						107: 'mpeg1_adts',
						108: 'jpeg_video',
						192: 'private_audio',
						208: 'private_video',
						224: 'pcm_little_endian_audio',
						225: 'vorbis_audio',
						226: 'dolby_v3_audio',
						227: 'alaw_audio',
						228: 'mulaw_audio',
						229: 'adpcm_audio',
						230: 'pcm_big_endian_audio',
						240: 'yv12_video',
						241: 'h264_video',
						242: 'h263_video',
						243: 'h261_video'
					}],
					stream_type: ['enum', 6, [
						null,
						'object',
						'clock',
						'scene',
						'visual',
						'audio',
						'mpeg-7',
						'ipmp',
						'oci',
						'mpeg-java'
					]],
					upstream_flag: 1,
					_reserved: ['const', 1, 1],
					buffer_size: 24,
					maxBitrate: 'uint32',
					avgBitrate: 'uint32'
				};

				case 5: return {
					audio_profile: ['enum', 5, [
						null,
						'aac-main',
						'aac-lc',
						'aac-ssr',
						'aac-ltp',
						'sbr',
						'aac-scalable',
						'twinvq',
						'celp',
						'hxvc',
						null,
						null,
						'ttsi',
						'main-synthesis',
						'wavetable-synthesis',
						'general-midi',
						'algorithmic-synthesis-and-audio-effects',
						'er-aac-lc',
						'reserved',
						'er-aac-ltp',
						'er-aac-scalable',
						'er-twinvq',
						'er-bsac',
						'er-aac-ld',
						'er-celp',
						'er-hvxc',
						'er-hiln',
						'er-parametric',
						'ssc',
						'ps',
						'mpeg-surround'
					]],
					sampling_freq: jBinary.Type({
						setParams: function () {
							this.freqList = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
						},
						read: function () {
							var freqIndex = this.binary.read(4);
							return freqIndex !== 15 ? this.freqList[freqIndex] : this.binary.read(24);
						},
						write: function (value) {
							var freqIndex = this.freqList.indexOf(value);
							if (freqIndex !== -1) {
								this.binary.write(4, freqIndex);
							} else {
								this.binary.write(4, 15);
								this.binary.write(24, value);
							}
						}
					}),
					channelConfig: 4,
					frameLength: ['enum', 1, [1024, 960]],
					dependsOnCoreCoder: 1,
					extensionFlag: 1
				};

				case 6: return {
					sl: ['const', 'uint8', 2]
				};
			}
		}
	})],

	esds: ['extend', 'FullBox', {
		sections: jBinary.Template({
			baseType: 'esds_section',
			read: function () {
				var end = this.binary.getContext('_end')._end, sections = [];
				while (this.binary.tell() < end) {
					sections.push(this.baseRead());
				}
				return sections;
			},
			write: function (sections) {
				for (var i = 0, length = sections.length; i < length; i++) {
					this.baseWrite(sections[i]);
				}
			}
		})
	}],

	File: ['Atoms', function () { return this.binary.view.byteLength }]
};

}).call(this);
