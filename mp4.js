(function (exports) {
var timeBasis = new Date(1970, 0, 1) - new Date(1904, 0, 1);

function MP4(data) {
    this.parser = new jBinary(data, MP4.structure);
    this.parser.findParentAtom = function (type) {
        return this.context.findParent(function (atom) { return atom.type === type });
    };
}

MP4.prototype.readBox = function () {
    return this.parser.parse('AnyBox');
};

MP4.structure = {
    ShortName: ['string', 4],

    uint64: function () {
        return this.parse('uint32') * Math.pow(2, 32) + this.parse('uint32');
    },

    Dimensions: function (type) {
        return this.parse({
            horz: type,
            vert: type
        });
    },

    Box: {
        _size: 'uint32',
        type: 'ShortName',
        size: function () {
            switch (this.context.getCurrent()._size) {
                case 0: return this.view.byteLength - this.tell() + 8;
                case 1: return this.parse('uint64');
                default: return this.context.getCurrent()._size;
            }
        },
        _endOf: function () {
            return this.tell() + (this.context.getCurrent().size - 8);
        }
    },

    FullBox: ['extend', 'Box', {
        version: 'uint8',
        flags: 24
    }],

    AnyBox: function () {
        var header = this.seek(this.tell(), function () { return this.parse('Box') });
        var endOf = this.tell() + header.size;
        var type = MP4.structure[header.type];
        if (!type) console.log(header.type);
        var box = type ? this.parse(type) : header;
        this.seek(endOf);
        return box;
    },

    Time: function (need64) {
        var intTime = this.parse(need64 ? 'uint64' : 'uint32');
        if (intTime) {
            return new Date(intTime + timeBasis);
        }
    },

    FixedPoint: function (baseType, n) {
        return this.parse(baseType) / (1 << n);
    },

    MultiBox: ['extend', 'Box', {
        atoms: function () {
            var atoms = [], endOf = this.context.getParent()._endOf;
            while (this.tell() < endOf) {
                atoms.push(this.parse('AnyBox'));
            }
            return atoms;
        }
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

    TimestampBox: ['extend', 'FullBox', {
        creation_time: function () { return this.parse('Time', this.context.getParent().version) },
        modification_time: function () { return this.parse('Time', this.context.getParent().version) }
    }],

    DurationBox: ['extend', 'TimestampBox', {
        timescale: 'uint32',
        duration: function () { return this.parse(this.context.getParent().version ? 'uint64' : 'uint32') }
    }],

    ftyp: ['extend', 'Box', {
        major_brand: 'ShortName',
        minor_version: 'uint32',
        compatible_brands: ['array', 'ShortName', function () { return (this.context.getParent().size - 16) / 4 }]
    }],

    free: 'Box',

    mdat: 'Box',

    moov: 'MultiBox',

    mvhd: ['extend', 'DurationBox', {
        rate: ['FixedPoint', 'uint32', 16],
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
        duration: function () { return this.parse(this.context.getParent().version ? 'uint64' : 'uint32') },
        _reserved2: ['skip', 8],
        layer: 'int16',
        alternate_group: 'uint16',
        volume: 'Volume',
        _reserved3: ['skip', 2],
        matrix: 'TransformationMatrix',
        size: ['Dimensions', ['FixedPoint', 'uint32', 16]]
    }],

    mdia: 'MultiBox',

    mdhd: ['extend', 'DurationBox', {
        _padding: 1,
        lang: function () {
            return String.fromCharCode.apply(
                String,
                this.parse('array', 5, 3).map(function (code) { return code + 0x60 })
            );
        },
        _reserved: ['skip', 2]
    }],

    hdlr: ['extend', 'FullBox', {
        _reserved: ['skip', 4],
        handler_type: function () {
            var handler_type = this.parse('string', 4);
            this.findParentAtom('trak')._handler_type = handler_type;
            return handler_type;
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

    VisualSampleEntry: ['extend', 'SampleEntry', {
        _reserved: ['skip', 16],
        size: ['Dimensions', 'uint16'],
        resolution: ['Dimensions', ['FixedPoint', 'uint32', 16]],
        _reserved2: ['skip', 4],
        frame_count: 'uint16',
        compressorname: function () {
            var length = this.parse('uint8');
            var name = this.parse('string', length);
            this.skip(32 - 1 - length);
            return name;
        },
        depth: 'uint16',
        _reserved3: ['skip', 2]
    }, function () {
        var endOf = this.context.getParent()._endOf, extension;
        if (this.tell() < endOf) {
            extension = {};
            extension.cleanaperture = this.parse('clap');
            if (this.tell() < endOf) {
                extension.pixelaspectratio = this.parse('pasp');
            }
        }
        return extension;
    }],

    AudioSampleEntry: ['extend', 'SampleEntry', {
        _reserved: ['skip', 8],
        channelcount: 'uint16',
        samplesize: 'uint16',
        _reserved2: ['skip', 2],
        samplerate: 'uint32'
    }],

    ArrayBox: function (type) {
        return this.parse('extend', 'FullBox', {
            entry_count: 'uint32',
            entries: ['array', type, function () { return this.context.getCurrent().entry_count }]
        });
    },

    stsd: function () {
        return this.parse(
            'ArrayBox',
            {soun: 'AudioSampleEntry', vide: 'VisualSampleEntry', meta: 'AnyBox'}[this.findParentAtom('trak')._handler_type] || 'SampleEntry'
        );
    },

    stdp: ['extend', 'FullBox', {
        priorities: ['array', 'uint16', function () {
            return this.findParentAtom('stbl')._sample_count;
        }]
    }],

    stsl: ['extend', 'FullBox', {
        _reserved: 7,
        constraint_flag: 1,
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

    ExtendedBoolean: ['enum', [undefined, true, false]],

    sdtp: ['extend', 'FullBox', {
        dependencies: ['array', {
            _reserved: 2,
            sample_depends_on: 'ExtendedBoolean',
            sample_is_depended_on: 'ExtendedBoolean',
            sample_has_redundancy: 'ExtendedBoolean'
        }, function () { return this.findParentAtom('stbl')._sample_count }]
    }],

    edts: 'MultiBox'
};

MP4.readFrom = function(source, callback) {
    function callbackWrapper(data) { callback.call(new MP4(data)) }

    if (source instanceof File) {
        // reading image from File instance

        var reader = new FileReader;
        reader.onload = function() { callbackWrapper(this.result) };
        reader.readAsArrayBuffer(source);
    } else {
        // reading image with AJAX request

        var xhr = new XMLHttpRequest;
        xhr.open('GET', source, true);

        // new browsers (XMLHttpRequest2-compliant)
        if ('responseType' in xhr) {
            xhr.responseType = 'arraybuffer';
        }
        // old browsers (XMLHttpRequest-compliant)
        else if ('overrideMimeType' in xhr) {
            xhr.overrideMimeType('text/plain; charset=x-user-defined');
        }
        // IE9 (Microsoft.XMLHTTP-compliant)
        else {
            xhr.setRequestHeader('Accept-Charset', 'x-user-defined');
        }

        xhr.onload = function() {
            if (this.status != 200) {
                throw new Error(this.statusText);
            }
            // emulating response field for IE9
            if (!('response' in this)) {
                this.response = new VBArray(this.responseBody).toArray().map(String.fromCharCode).join('');
            }
            callbackWrapper(this.response);
        };

        xhr.send();
    }
};

exports.MP4 = MP4;
})(this);