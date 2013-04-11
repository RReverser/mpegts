(function (exports) {
var timeBasis = new Date(1970, 0, 1) - new Date(1904, 0, 1);

function MP4(data) {
    this.parser = new jBinary(new jDataView(data), MP4.structure);
}

MP4.prototype.readBox = function () {
    return this.parser.parse('Box');
};

MP4.structure = {
    expect: function (type, value, errorMsg) {
        if (this.parse(type) != value) {
            throw new TypeError(errorMsg);
        }
    },

    ShortName: ['string', 4],

    'uint64': function () {
        return this.parse('uint32') * Math.pow(2, 32) + this.parse('uint32');
    },

    BoxHeader: function (flags) {
        var header = this.parse({
            _size: 'uint32',
            type: 'ShortName',
            size: function () {
                switch (this.current._size) {
                    case 0: return this.view.byteLength - this.tell() + 8;
                    case 1: return this.parse('uint64');
                    default: return this.current._size;
                }
            }
        });
        if (flags !== undefined) {
            header.version = this.parse('uint8');
            var afterFlags = this.tell() + 3;
            if (flags instanceof Object) {
                var oldCurrent = this.current;
                this.current = header;
                header.flags = this.parse(flags);
                this.current = oldCurrent;
            }
            this.seek(afterFlags);
            this._bitShift = 0;
        }
        return header;
    },

    Box: function () {
        var header = this.seek(this.tell(), function () {
            return this.parse('BoxHeader');
        });
        var afterBox = this.tell() + header.size;
        var type = MP4.structure[header.type];

        if (!type) console.log(header.type);

        var box = type ? this.parse(type) : {header: header};
        if (!type) this.seek(afterBox);
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

    MultiBox: {
        header: 'BoxHeader',
        atoms: function () {
            var atoms = [], endOf = this.tell() + (this.current.header.size - 8);
            while (this.tell() < endOf) {
                atoms.push(this.parse('Box'));
            }
            return atoms;
        }
    },

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

    ftyp: {
        header: 'BoxHeader',
        major_brand: 'ShortName',
        minor_version: 'uint32',
        compatible_brands: ['array', 'ShortName', function () { return (this.current.header.size - 16) / 4 }]
    },

    moov: 'MultiBox',

    mvhd: {
        header: ['BoxHeader', 0],
        creation_time: function () { return this.parse('Time', this.current.header.version) },
        modification_time: function () { return this.parse('Time', this.current.header.version) },
        timescale: 'uint32',
        duration: function () { return this.parse(this.current.header.version ? 'uint64' : 'uint32') },
        rate: ['FixedPoint', 'uint32', 16],
        volume: 'Volume',
        _reserved: ['skip', 10],
        matrix: 'TransformationMatrix',
        _reserved2: ['skip', 24],
        next_track_ID: 'uint32'
    },

    trak: 'MultiBox',

    tkhd: {
        header: ['BoxHeader', {
            track_enabled: 1,
            track_in_movie: 1,
            track_in_preview: 1
        }],
        creation_time: function () { return this.parse('Time', this.current.header.version) },
        modification_time: function () { return this.parse('Time', this.current.header.version) },
        track_ID: 'uint32',
        _reserved: ['skip', 4],
        duration: function () { return this.parse(this.current.header.version ? 'uint64' : 'uint32') },
        _reserved2: ['skip', 8],
        layer: 'int16',
        alternate_group: 'uint16',
        volume: 'Volume',
        _reserved3: ['skip', 2],
        matrix: 'TransformationMatrix',
        width: ['FixedPoint', 'uint32', 16],
        height: ['FixedPoint', 'uint32', 16]
    },

    mdia: 'MultiBox',

    mdhd: {
        header: ['BoxHeader', 0],
        creation_time: function () { return this.parse('Time', this.current.header.version) },
        modification_time: function () { return this.parse('Time', this.current.header.version) },
        timescale: 'uint32',
        duration: function () { return this.parse(this.current.header.version ? 'uint64' : 'uint32') },
        _padding: 1,
        lang: function () {
            return String.fromCharCode.apply(
                String,
                this.parse('array', 5, 3).map(function (code) { return code + 0x60 })
            );
        },
        _reserved: ['skip', 2]
    },

    hdlr: {
        header: ['BoxHeader', 0],
        _reserved: ['skip', 4],
        handler_type: ['string', 4],
        _reserved2: ['skip', 12],
        name: function () {
            var bytes = [], nextByte;
            while (nextByte = this.parse('uint8')) {
                bytes.push(nextByte);
            }
            return String.fromCharCode.apply(String, bytes);
        }
    },

    minf: 'MultiBox'
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
}

exports.MP4 = MP4;
})(this);