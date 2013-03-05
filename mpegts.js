function MPEGTS(data) {
    this.parser = new jParser(new jDataView(data), MPEGTS.structure);
    this.pat = [];
}

MPEGTS.prototype.readPacket = function (index) {
    var data, mpegts = this;
    function callback() {
        data = this.parse(['TSPacket', mpegts]);
    }
    if (index === undefined) {
        callback.call(this.parser);
    } else {
        this.parser.seek(index * 188, callback);
    }
    return data;
};

MPEGTS.structure = {
    PCR: ['bitfield', {
        base: 33,
        reserved: 6,
        extension: 9,
        total: function () {
            return 300 * (300 * this.current.base + this.current.extension);
        }
    }],

    Field: {
        length: 'uint8',
        data: function () {
            return this.parse(['array', 'uint8', this.current.length]);
        }
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
        pcr: function () {
            if (this.current.header.hasPCR) {
                return this.parse('PCR');
            }
        },
        opcr: function () {
            if (this.current.header.hasOPCR) {
                return this.parse('PCR');
            }
        },
        spliceCountdown: function () {
            if (this.current.header.hasSplicingPoint) {
                return this.parse('uint8');
            }
        },
        privateData: function () {
            if (this.current.header.hasTransportPrivateData) {
                return this.parse('Field');
            }
        },
        extension: function () {
            if (this.current.header.hasExtension) {
                return this.parse('Field');
            }
        }
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
        prefix: ['string', 3],
        streamId: 'uint8',
        length: 'uint16',
        others: function () {
            return this.parse(['array', 'uint8', this.current.length]);
        }
    },

    TSPrivateSection: function (mpegts, tsHeader) {
        return this.parse({
            pointerField: function () {
                if (tsHeader.payloadStart) {
                    return this.parse('uint8');
                }
            },

            tableId: 'uint8',
            flags: ['bitfield', {
                isLongSection: 1,
                isPrivate: 1,
                reserved: 2,
                sectionLength: 12
            }],

            data: function () {
                if (!this.current.flags.isLongSection) {
                    return this.parse(['array', 'uint8', this.current.flags.sectionLength]);
                }

                var header = this.parse(['bitfield', {
                    tableIdExt: 16,
                    reserved: 2,
                    versionNumber: 5,
                    currentNextIndicator: 1,
                    sectionNumber: 8,
                    lastSectionNumber: 8
                }]);
                var dataLength = this.current.flags.sectionLength - 9;
                var data;
                switch (this.current.tableId) {
                    case 0:
                        data = this.parse(['array', ['bitfield', {
                            programNumber: 16,
                            reserved: 3,
                            pid: 13
                        }], dataLength / 4]);
                        if (header.sectionNumber == 0) {
                            mpegts.pat = [];
                        }
                        for (var i = 0; i < data.length; i++) {
                            mpegts.pat[data[i].programNumber] = data[i].pid;
                        }
                        break;

                    case 2:
                        data = this.parse(['bitfield', {
                            reserved: 3,
                            pcr_pid: 13,
                            reserved2: 4,
                            programInfoLength: 12
                        }]);
                        data.programDescriptors = this.parse(['array', 'uint8', data.programInfoLength]);
                        data.mappings = [];
                        dataLength -= 4 + data.programInfoLength;
                        while (dataLength > 0) {
                            var mapping = this.parse(['bitfield', {
                                streamType: 8,
                                reserved: 3,
                                elementaryPID: 13,
                                reserved2: 4,
                                esInfoLength: 12
                            }]);
                            mapping.esInfo = this.parse(['array', 'uint8', mapping.esInfoLength]);
                            data.mappings.push(mapping);
                            dataLength -= 5 + mapping.esInfoLength;
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
            _startof: function () {
                return this.tell();
            },
            header: 'TSHeader',

            adaptationField: function () {
                if (this.current.header.hasAdaptationField) {
                    return this.parse('TSAdaptationField');
                }
            },

            payload: function () {
                if (!this.current.header.hasPayload) return;

                if (this.current.header.pid < 2 || mpegts.pat.indexOf(this.current.header.pid) >= 0) {
                    return this.parse(['TSPrivateSection', mpegts, this.current.header]);
                } else {
                    return this.parse(['array', 'uint8', 188 - (this.tell() - this.current._startof)]);
                }
            }
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
