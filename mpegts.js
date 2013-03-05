function MPEGTS(data) {
    this.parser = new jParser(new jDataView(data), MPEGTS.structure);
    this.pat = {};
    this.pmt = {};
}

MPEGTS.prototype.readPacket = function (index) {
    var data, mpegts = this;
    function callback() {
        data = this.parse(['TSPacket', mpegts]);
    }
    index === undefined ? callback.call(this.parser) : this.parser.seek(index * 188, callback);
    return data;
};

MPEGTS.structure = {
    PCR: function () {
        var pcr = this.parse(['bitfield', {
            base: 33,
            _reserved: 6,
            extension: 9
        }]);
        return 300 * (300 * pcr.base + pcr.extension);
    },

    Field: {
        length: 'uint8',
        data: ['array', 'uint8', function () { return this.current.length }]
    },

    TSAdaptationHeader: {
        length: 'uint8',
        flags: ['bitfield', {
            discontinuity: 1,
            randomAccess: 1,
            priority: 1,
            hasPCR: 1,
            hasOPCR: 1,
            hasSplicingPoint: 1,
            hasTransportPrivateData: 1,
            hasExtension: 1
        }]
    },

    TSAdaptationField: {
        header: 'TSAdaptationHeader',
        pcr: ['if', function () { return this.current.header.flags.hasPCR }, 'PCR'],
        opcr: ['if', function () { return this.current.header.flags.hasOPCR }, 'PCR'],
        spliceCountdown: ['if', function () { return this.current.header.flags.hasSplicingPoint }, 'uint8'],
        privateData: ['if', function () { return this.current.header.flags.hasTransportPrivateData }, 'Field'],
        extension: ['if', function () { return this.current.header.flags.hasExtension }, 'Field']
    },

    TSHeader: ['bitfield', {
        syncByte: 8,

        transportError: 1,
        payloadStart: 1,
        transportPriority: 1,
        pid: 13,

        scramblingControl: 2,
        hasAdaptationField: 1,
        hasPayload: 1,
        contCounter: 4
    }],

    PES: {
        prefix: function () {
            var prefix = this.parse(['array', 'uint8', 3]);
            if (!(prefix[0] == 0x00 && prefix[1] == 0x00 && prefix[2] == 0x01)) {
                throw new TypeError('Corrupted PES packet.');
            }
            return prefix;
        },
        streamId: 'uint8',
        length: 'uint16',
        extension: ['if', function () { return !(this.current.streamId == 0xBE || this.current.streamId == 0xBF) }, function () {
            var extension = this.parse(['bitfield', {
                prefix: 2,
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
                length: 8
            }]);
            if (extension.prefix != 2) {
                throw new TypeError('Corrupted PES extension.');
            }
            this.skip(extension.length);
            return extension;
        }],
        elementaryStream: ['array', 'uint8', function () { return this.current.length - this.current.extension.length - 3 }]
    },

    TSPrivateSection: function (mpegts, tsHeader) {
        return this.parse({
            pointerField: ['if', tsHeader.payloadStart, 'uint8'],
            tableId: 'uint8',
            flags: ['bitfield', {
                isLongSection: 1,
                isPrivate: 1,
                _reserved: 2,
                sectionLength: 12
            }],

            data: function () {
                if (!this.current.flags.isLongSection) {
                    return this.parse(['array', 'uint8', this.current.flags.sectionLength]);
                }

                var header = this.parse(['bitfield', {
                    tableIdExt: 16,
                    _reserved: 2,
                    versionNumber: 5,
                    currentNextIndicator: 1,
                    sectionNumber: 8,
                    lastSectionNumber: 8
                }]);

                var dataLength = this.current.flags.sectionLength - 9, data;

                switch (this.current.tableId) {
                    case 0:
                        data = this.parse(['array', ['bitfield', {
                            programNumber: 16,
                            _reserved: 3,
                            pid: 13
                        }], dataLength / 4]);

                        if (header.sectionNumber == 0) {
                            mpegts.pat = {};
                        }

                        for (var i = 0; i < data.length; i++) {
                            mpegts.pat[data[i].pid] = data[i];
                        }

                        break;

                    case 2:
                        data = this.parse(['bitfield', {
                            _reserved: 3,
                            pcrPID: 13,
                            _reserved2: 4,
                            programInfoLength: 12
                        }]);

                        data.programDescriptors = this.parse(['array', 'uint8', data.programInfoLength]);
                        data.mappings = [];
                        
                        dataLength -= 4 + data.programInfoLength;

                        while (dataLength > 0) {
                            var mapping = this.parse(['bitfield', {
                                streamType: 8,
                                _reserved: 3,
                                elementaryPID: 13,
                                _reserved2: 4,
                                esInfoLength: 12
                            }]);
                            mapping.esInfo = this.parse(['array', 'uint8', mapping.esInfoLength]);
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
                        data = this.parse(['array', 'uint8', dataLength]);
                        break;
                }

                var crc32 = this.parse('uint32');

                return {
                    header: header,
                    data: data,
                    crc32: crc32
                };
            }
        });
    },

    TSPacket: function (mpegts) {
        return this.parse({
            _startof: function () { return this.tell() },
            header: 'TSHeader',
            adaptationField: ['if', function () { return this.current.header.hasAdaptationField }, 'TSAdaptationField'],

            payload: ['if', function () { return this.current.header.hasPayload }, function () {
                if (this.current.header.pid < 2 || this.current.header.pid in mpegts.pat) {
                    return this.parse(['TSPrivateSection', mpegts, this.current.header]);
                }
                if (this.current.header.pid in mpegts.pmt) {
                    return this.parse('PES');
                }
                return this.parse(['array', 'uint8', 188 - (this.tell() - this.current._startof)]);
            }]
        });
    }
};

MPEGTS.readFrom = function(source, callback) {
    function callbackWrapper(data) { callback.call(new MPEGTS(data)) }

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
        }

        xhr.send();
    }
}
