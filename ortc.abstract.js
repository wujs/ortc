
(function (globals, factory) {
    if (typeof define === 'function' && define.amd) {
      // AMD. Register as an anonymous module.
      define(factory);
    } else {
      // Browser global
      globals.AORTC = factory();
    }
}(this, function () {

    var global = window;
    var ORTC = null;



    /* ########################################################################
     * # MediaSocket - An RTP based socket.
     * ######################################################################## */

    var MediaSocket = function(id, options) {
        if (typeof id === "object" && typeof options === "undefined") {
            options = id;
            id = undefined;
        }
        this.id = id || ORTC._getRandomString(32);
        options = options || {};

        ASSERT.isString(this.id);
        ASSERT.isObject(options);

        this._stunServers = options.stunServers || [
            // e.g. {
            //     server: "1.2.3.4",
            //     port: 3478
            // }
        ];
        this._turnServers = options.turnServers || [
            // e.g. {
            //     server: "11.12.13.14",
            //     port: 3478,
            //     username: "example",
            //     password: "example",
            //     realm: "domain.com"
            // }
        ];
        // Restrict the kind of media allowed.
        this._kinds = options.kinds || [
            // no restrictions by default
            // e.g. "audio", "dtmf"
        ];
        this._rtcRtcpMux = options.rtcRtcpMux || true;

        ASSERT.isArray(this._stunServers);
        ASSERT.isArray(this._turnServers);
        ASSERT.isArray(this._kinds);
        ASSERT.isBoolean(this._rtcRtcpMux);
    }



    /* ########################################################################
     * # DataSocket - A data based socket.
     * ######################################################################## */

    var DataSocket = function(id, options) {
        if (typeof id === "object" && typeof options === "undefined") {
            options = id;
            id = undefined;
        }
        this.id = id || ORTC._getRandomString(32);
        options = options || {};

        ASSERT.isString(this.id);
        ASSERT.isObject(options);

        this._stunServers = options.stunServers || [];
        this._turnServers = options.turnServers || [];

        ASSERT.isArray(this._stunServers);
        ASSERT.isArray(this._turnServers);

        if (options.publicKey || options.privateKey) {
            ASSERT.isString(options.publicKey);   // DER encoded private key
            ASSERT.isString(options.privateKey);  // DER encoded private key
            this.publicKey = options.publicKey;
            this._privateKey = options.privateKey;
            this.fingerprint = "<todo>";
        } else {
            // NOTE: The private key generated by the browser is not accessible from JavaScript. Don't like that? Generate you own.
            // TODO: Implement.
            // this.publicKey = options.publicKey || internalBrowser.getDEREncodedPublicKey();
            this.fingerprint = "<todo>";    // hash(this.publicKey);
        }

        ASSERT.isString(this.fingerprint);
    }



    /* ########################################################################
     * # MediaDataSocket - A collection of specialized sockets.
     * ######################################################################## */

    var MediaDataSocket = function(id, options) {
        if (typeof id === "object" && typeof options === "undefined") {
            options = id;
            id = undefined;
        }
        this.id = id || ORTC._getRandomString(32);
        options = options || {};

        ASSERT.isString(this.id);
        ASSERT.isObject(options);

        this._stunServers = options.stunServers || [];
        this._turnServers = options.turnServers || [];
        this._kinds = options.kinds || [];
        this._rtcRtcpMux = options.rtcRtcpMux || true;

        ASSERT.isArray(this._stunServers);
        ASSERT.isArray(this._turnServers);
        ASSERT.isArray(this._kinds);
        ASSERT.isBoolean(this._rtcRtcpMux);

        if (options.publicKey || options.privateKey) {
            ASSERT.isString(options.publicKey);   // DER encoded private key
            ASSERT.isString(options.privateKey);  // DER encoded private key
            this.publicKey = options.publicKey;
            this._privateKey = options.privateKey;
            this.fingerprint = "<todo>";
        } else {
            // NOTE: The private key generated by the browser is not accessible from JavaScript. Don't like that? Generate you own.
            // TODO: Implement.
            // this.publicKey = options.publicKey || internalBrowser.getDEREncodedPublicKey();
            this.fingerprint = "<todo>";    // hash(this.publicKey);
        }

        ASSERT.isString(this.fingerprint);
    }



    /* ########################################################################
     * # Connection
     * ######################################################################## */

    var Connection = function(options) {
        options = options || {};

        this._sockets = options.sockets || [
            new MediaDataSocket("default", options)
        ];
        this.id = ORTC._getRandomString(32);
        this.activated = options.activated || true;
        // What we expect to receive.
        this._receiveConstraints = options.receiveConstraints || ORTC.getConstraints();
        // What peer expects to receive.
        this._sendConstraints = options.sendConstraints || ORTC.getConstraints();

        ASSERT.isArray(this._sockets);
        ASSERT.isBoolean(this.activated);
        ASSERT.isObject(this._receiveConstraints);
        ASSERT.isObject(this._sendConstraints);

        this.fingerprints = {};
        for (var i = 0; i<this._sockets.length; i++) {
            if (this.fingerprints[this._sockets[i].id]) {
                throw new Error("Socket with id '" + this._sockets[i].id + "' is duplicated!");
            }
            this.fingerprints[this._sockets[i].id] = this._sockets[i].fingerprint;
        }

        this.localDescription = this.getDescription(false);
        this.remoteDescription = null;

        this._streams = {};
    };

    /**
     * Connection candidate is discovered.
     */
    Connection.prototype.onconnectioncandidate = function(candidate) {
        ASSERT.isObject(candidate);
        ASSERT.isNumber(candidate.sdpMLineIndex);
        ASSERT.isString(candidate.sdpMid);
        ASSERT.isString(candidate.candidateType);

        if (candidate.candidateType === "ICE") {
            ASSERT.isString(candidate.socketId);  // socket id where candidate was discovered
            ASSERT.isString(candidate.foundation);
            ASSERT.isNumber(candidate.componentId);
            ASSERT.isString(candidate.transport);
            ASSERT.isNumber(candidate.priority);
            ASSERT.isString(candidate.connectionAddress);
            ASSERT.isNumber(candidate.connectionPort);
            ASSERT.isString(candidate.type);
            if (typeof candidate.relatedAddress !== "undefined") {
                ASSERT.isString(candidate.relatedAddress);
            }
            if (typeof candidate.relatedPort !== "undefined") {
                ASSERT.isNumber(candidate.relatedPort);
            }
            if (typeof candidate.generation !== "undefined") {
                ASSERT.isNumber(candidate.generation);
            }
        }
    }

    /**
     * Connection candidate discovery is complete - notifies list of all candidates found.
     */
    Connection.prototype.onconnectioncandidatesdone = function(candidates) {
        ASSERT.isArray(candidates);
        ASSERT.isObject(candidates[0]);
    }

    /**
     * Indiciated which pairing of candidates is active on a connection at this time.
     * Fires before connected and may continue to fire after if connection candidate pairing in use changes.
     */
    Connection.prototype.onactiveconnectioncandidate = function(localCandidate, remoteCandidate) {
        ASSERT.isObject(localCandidate);
        ASSERT.isObject(remoteCandidate);
    }

    /**
     * Connection is established.
     */
    Connection.prototype.onconnected = function() {
    }

    /**
     * Connection is now gone (and cannot be recovered)
     */
    Connection.prototype.ondisconnected = function(reason) {
        ASSERT.isString(reason);
        // TODO: define what "reasons" can exist for the disconnected event
    }

    /**
     * A send or receive stream has at least one track connected.
     */
    Connection.prototype.onstreamconnected = function(stream, options) {
        ASSERT.isObject(stream);
        ASSERT.isObject(options);
    }

    //------------------------------------------------------------------------
    // a send or receive stream is now completely disconnected
    Connection.prototype.onstreamdisconnected = function(stream, reason) {
        ASSERT.isObject(stream);
        // TODO: define what "reasons" can exist for the disconnected event
    }

    //------------------------------------------------------------------------
    // report on a stream (or more likely a stream's track), to indicate current network conditions (e.g. quality report)
    Connection.prototype.onsteamreport = function(stream, report) {
        ASSERT.isObject(stream);
        ASSERT.isObject(report);

        // example report (mostly TBD at this point)
        report = {
            //...
        };
    }

    //------------------------------------------------------------------------
    // a track has connected, possible an incoming track is not yet attached to a stream if receiveStream was not called with a matching track to the incoming stream
    Connection.prototype.ontrackconnected = function(track, ssrc, socketId) {
    }

    //------------------------------------------------------------------------
    // a track has disconnected
    Connection.prototype.ontrackdisconnected = function(track, reason) {
        // TODO: define what "reasons" can exist for the disconnected event
        // one of the reasons must be an SSRC collision detection
    }

    //------------------------------------------------------------------------
    // notification that the contributing sources (CSRC) for a track has changed
    Connection.prototype.ontrackcontributors = function(track, csrcs) {
        // example:
        csrcs = [
          csrc1,    // i.e. the ssrc from a remote connection's track
          csrc2
        ];
    }

    //------------------------------------------------------------------------
    // report on a stream (or more likely a stream's track), to indicate current network conditions (e.g. quality report)
    Connection.prototype.ontrackreport = function(track, report) {
        ASSERT.isObject(track);
        ASSERT.isObject(report);

        // example report (mostly TBD at this point)
        report = {
            //...
        };
    }

    //------------------------------------------------------------------------
    // cause a connection to be activate (or cause to deactivate); if streams are being sent, they will all pause, default state is already active
    Connection.prototype.activate = function(activate) {
        activate = activate || true;
        ASSERT.isBoolean(activate);

        this.activate = activate;
    }

    /**
     * Disconnect the connection (once disconnected, it cannot be recovered)
     */
    Connection.prototype.disconnect = function() {
    }

    /**
     * Tell connection about a candidate that was discovered by remote party
     */
    Connection.prototype.addRemoteConnectionCandidate = function(candidateOrCandidates) {
        if (Array.isArray(candidateOrCandidates)) {
            ASSERT.isObject(candidateOrCandidates[0]);
        } else {
            ASSERT.isObject(candidateOrCandidates);
        }
    }

    /**
     * @param `selector` <mixed>  false|true|"local"|"remote"|<stream>
     * @return <object>  Description
     */
    Connection.prototype.getDescription = function(selector, options) {
        if (typeof selector === "undefined") {
            selector = false;
        }
        options = options || {};
        // the output must contain FEC redendent tracks
        options.fec = options.fec || false;
        // the output must limit the FEC redendent tracks to these "kinds" of media
        // [] = no restrictions, e.g. ["audio","dtmf"] to make redendency for audio/dtmf tracks only
        options.fecKinds = options.fecKinds || [];

        if (typeof selector === "boolean") {
            selector = (selector === true) ? "remote" : "local";
        }

        var stream = null;
        var streamId = null;
        if (typeof selector === "string") {
            if (selector === "local" || selector === "remote") {
                return ORTC._deepCopy(this[selector + "Description"] || (selector === "local" && (this[selector + "Description"] = {
                    // the cname value is per RTP "session" as per their rules (is the scoping correct??? -- would be nicer if it scoped more locally to be used for msid/track coordination)
                    cname: ORTC._getRandomString(32),
                    // this is be used as the userFrag for the iceCandidate and for input into the cyrptographic salt to prevent SSRC collision resolution issues
                    contextId: ORTC._getRandomString(32),
                    // this is used for the password for the iceCandidate and can be used for other purposes too
                    secret: ORTC._getRandomString(32),
                    fingerprints: this.fingerprints
                }))) || null;
            } else {
                streamId = selector;
            }
        } else {
            ASSERT.isObject(selector);
            ASSERT.isString(selector.id);
            stream = selector;
            streamId = selector.id;
        }

        if (this._streams[streamId]) {
            return ORTC._deepCopy(this._streams[streamId].description);
        }

        var direction = (this._streams[streamId] && this._streams[streamId].direction) || "send";
        var description = this.getDescription((direction === "send") ? "local" : "remote");

        if (stream) {
            var self = this;

            /*
            // This is example of the mapping to convert each track into an RTP stream mux.
            // If it is not previously specified, it will be generated. Missing tracks in the map
            // will auto-generate missing entries.

            description.tracks = [
                { // audio
                    track: "<track-id>",                 // can specify track object to ensure exact match
                    ssrc: 5,                             // if ssrc is provided, use it, otherwise system chooses
                    redundencySsrc: 10,                  // if specified, the track associated with this SSRC is an FEC redundent stream of the current stream
                    socketId: "my-audio-port",           // which socket id to carry this media over (defaulted to first socket port id)
                    constraints: { /* constraints / }    // optional set of constraints to apply to track, taken from system if not specified
                },
                { // video
                    kind: "video",                       // in this example, no track object specified thus first track that matches this "kind" is used
                    ssrc: 10,
                    socketId: "my-video-port",           // which socket id to carry this media over, in this case send over the second port
                    constraints: { /* constraints / }
                 },
                 { // dtmf
                    kind: "dtmf",
                    ssrc: 5,                             // legal to specify same ssrc so long as it is a different "kind", remote will know they are synchronized together
                    socketId: "my-audio-port",           // which socket id to carry this media over
                    constraints: { /* constraints / }    // constraints on the same SSRC must match for crypto algorithms but codecs can optionally filter out based on "kind"
                 },
                 { // unspecified
                     track: "poor-taste-track-id",
                     omit: true                          // this track will not be sent on the wire
                 }
            ];
            */

            // TODO: Take existing from `options.tracks` and augment missing properties.
            description.tracks = [];

            if (typeof stream.getAudioTracks === "function") {
                stream.getAudioTracks().forEach(function(track) {
                    description.tracks.push({
                        kind: "audio",
                        track: track.id,
                        ssrc: ORTC._getRandomNumber(9),
                        socketId: self._sockets[0].id
//                        constraints: {}
                    });
                });
            }
            if (typeof stream.getVideoTracks === "function") {
                stream.getVideoTracks().forEach(function(track) {
                    description.tracks.push({
                        kind: "video",
                        track: track.id,
                        ssrc: ORTC._getRandomNumber(9),
                        socketId: self._sockets[0].id
//                        constraints: {}
                    });
                });
            }
        }

        if (!this._streams[streamId]) {
            this._streams[streamId] = {
                id: streamId
            };
        }
        this._streams[streamId].description = description;
/*
        if (stream instanceof DataStream) {
            description.socketId = options.socketId || socket.internalFindFirstDataSocketId();
        }
*/
        return ORTC._deepCopy(description);
    }

    /**
     * @param `selector` <mixed>  false|true|"local"|"remote"|<stream>
     * @return void
     */
    Connection.prototype.setDescription = function(description, selector) {

        ASSERT.isObject(description);

        if (typeof selector === "undefined") {
            selector = false;
        }
        if (typeof selector === "boolean") {
            selector = (selector === true) ? "remote" : "local";
        }

        var streamId = null;
        if (typeof selector === "string") {
            if (selector === "remote" || selector === "local") {
                this[selector + "Description"] = description;
                return;
            } else {
                streamId = selector;
            }
        } else {
            ASSERT.isObject(selector);
            ASSERT.isString(selector.id);
            streamId = selector.id;
        }

        if (!this._streams[streamId]) {
            // NOTE: We assume that we are setting description for a `receive` stream
            //       so we can default some properties although we don't set the `direction` property yet.
            // TODO: Decide if we should assume this is a receive stream or mandate that `receiveStream`
            //       must be called before being able to call `setDescription` for the receive stream.
            this._streams[streamId] = {
                id: streamId,
                // TODO: Carry this in `descriptor` or change requirement for needing to know `kind`.
                kind: "MediaStream",
                // TODO: Use `this.getConstraints(true)`
                constraints: this._receiveConstraints
            };
        }
        this._streams[streamId].description = description;
    }

    //------------------------------------------------------------------------
    // get the send, receive, stream or track constraints in use, or prepares new constraints for a stream not yet sent
    Connection.prototype.getConstraints = function(selector, track, ssrc, socketId) {
        selector = selector || false;

        if (typeof selector === "string") {
            if (selector === "receive") {
                selector = true;
            } else
            if (selector === "send") {
                selector = false;
            }
        }

        if (selector === false) {
            return this._sendConstraints;
        } else
        if (selector === true) {
            return this._receiveConstraints;
        } else {
            ASSERT.isObject(selector);
            if (!(selector instanceof MediaStream)) {
                throw Error("must specify a media stream");
            }

            if (typeof track === "object") {
                if (!(track instanceof MediaStreamTrack)) {
                    throw Error("must specify a media stream track");
                }

                return this.internalFindTrack(stream, track, ssrc, socketId).constraints;
            }

            if (selector instanceof MediaStream) {
               return this._streams[selector.id].constraints;
            }

        }
        return null;
    }

    //------------------------------------------------------------------------
    // set the send, receive, stream or track constraints in use
    Connection.prototype.setConstraints = function(constraints, selector, track, ssrc, socketId) {
        applyLocal = selector || false;

        if (typeof selector === "string") {
            if (selector === "receive") {
                selector = true;
            } else
            if (selector === "send") {
                selector = false;
            }
        }

        ASSERT.isBoolean(selector);

        if (selector === false) {
            this._sendConstraints = constraints;
        } else
        if (selector === true) {
            this._receiveConstraints = constraints;
        } else {
            ASSERT.isObject(selector);

            if (!(selector instanceof MediaStream)) {
                throw Error("must be an instance of a media stream");
            }
            if (typeof track === "object") {
                if (!(selector instanceof MediaStreamTrack)) {
                    throw Error("must be an instance of a media track");
                }
                this.internalFindTrack(stream, track, ssrc, socketId).constraints = constraints;
                return;
            }

            this._streams[selector.id].constraints = constraints;
        }
    }

    /**
     * Send a stream to the remote party
     */
    Connection.prototype.sendStream = function(stream, options) {

        ASSERT.isObject(stream);

        if (options === false) {
            options = {
                "remove": true
            };
        } else {
            options = options || {};
        }

        ASSERT.isObject(options);

        if (this._streams[stream.id]) {
            if (
                this._streams[stream.id].direction &&
                this._streams[stream.id].direction === "receive"
            ) {
                throw new Error("Send stream with id '" + stream.id + "' is already attached as a receive stream!");
            }

            if (options.remove) {
                delete this._streams[stream.id];
                return stream;
            }

            options.description = options.description || this._streams[stream.id].description;
            options.constraints = options.constraints || this._streams[stream.id].constraints;
        }

        var description = options.description || this.getDescription(stream);
        delete options.description;

        // TODO: Use `this.getConstraints(false)`
        var constraints = options.constraints || this._sendConstraints;
        delete options.constraints;

        this._streams[stream.id] = {
            id: stream.id,
            kind: "MediaStream",
            stream: stream,
            direction: "send",
            options: options,
            description: description,
            constraints: constraints
        };

        return stream;
    }

    //------------------------------------------------------------------------
    // setup the stream information for a stream to be received
    Connection.prototype.receiveStream = function(stream, options) {
        options = options || {};

        ASSERT.isObject(stream);

        if (this._streams[stream.id]) {
            if (this._streams[stream.id].direction === "send") {
                throw new Error("Receive stream with id '" + strean.id + "' is already attached as a send stream!");
            }

            if (typeof options === "boolean") {
                ASSERT.equal(options, false);
                delete this._streams[stream.id];
                return stream;
            }

            // NOTE: This is an update to an existing stream, fill in the missing opions from the previous options
            options.constraints = options.constraints || this._streams[stream.id].constraints;
            options.description = this.stream[stream.id].description;
        }

        options.constraints = options.constraints || this._receiveConstraints;

        if (stream instanceof MediaStream) {
            // This is an example of what could be set to cause auto-mapping for incoming RTP streams to tracks for this stream,
            // without necessarily having obtained a description from the remote party of the stream.
            options.description.tracks = [
                {
                    kind: "audio",                         // must be of kind audio, all others do not match
                    ssrc: 5,                               // if ssrc is provided, steam must match this ssrc
                    socketId: "my-audio-port",             // which socket id to carry this media over (defaulted to the first socket's port)
                    constraints: { /* constraints */ }     // the expecations of the stream, only these may match
                },
                {
                    kind: "video",                         // in this example, no track-id specified, then first incoming track that matches this "kind" is used
                    socketId: "my-video-port",             // which socket id to carry this media over
                    // ssrc: 10,                           // no ssrc provided, so don't care what it is, any video will do
                    // constraints: { /* constraints */ }  // connection level constraints must apply if ssrc is missing
                },
                {
                    kind: "dtmf",                          // must be of kind audio, all others do not match
                    ssrc: 5,                               // if ssrc is provided, steam must match this ssrc, okay to mux different streams with same ssrc so long as they are a different kind and thus can be distinguished by codec
                    socketId: "my-audio-port",             // which socket id to carry this media over
                    constraints: { /* constraints */ }     // the expecations of the stream, only these may match
                },
                {
                    track: "<existing-track-id>",          // when specifying an existing track, this performs an update, including a potential ssrc "remapping" or a constraints update if the track exist, or this will be presumed to be the remote track-id yet to arrive
                    // kind: "other",                      // ignored, taken from track object if object exists, or may not be needed if mapping to a particular ssrc
                    ssrc: 17,                              // if ssrc is provided, steam must match this ssrc
                    socketId: "my-other-port",             // which socket id to carry this media over
                    constraints: { /* constraints */ }     // the expecations of the stream, only these may match
                }
            ];
        }

        if (stream instanceof DataStream) {
            options.socketId = options.socketId || socket.internalFindFirstDataSupportingsocket();
            if (typeof options.portId === "undefined") {
                throw Error("no socket found supporting data");
            }
        }

        // TODO: fill in "this.options.constraints.tracks" for tracks that are specified, and auto-fill for tracks that are auto-mapped as they are detected in the receive.

        var description = options.description;
        delete options.description;

        var constraints = options.constraints || this._receiveConstraints;
        delete options.constraints;

        this._streams[stream.id] = {
            stream: stream,
            direction: "receive",
            options: options,
            description: description,
            constraints: constraints
        };

        return stream;
    }

    //------------------------------------------------------------------------
    // calling this rountine will setup a brand new connection from the existing with the identical constraints, but fork will contain no remote candidates, streams or remote constraints.
    //
    // This is only to be used in situations where the same set of constraints were sent to multiple locations, each giving their own candidate/constraint responses,
    // e.g. Alice calls Bob but Bob has two devices and both devices reply with candidates/constraints.
    //
    // Normally a new connection object should be created to ensure each remote party has their own constraints for security reasons.
    Connection.prototype.fork = function() {
    }



    /* ########################################################################
     * # DTMFMediaStreamTrack
     * ######################################################################## */

    var DTMFMediaStreamTrack = function() {
        this.kind = "dtmf";
        // this.id = <guid>
    }

    //------------------------------------------------------------------------
    // start playing a particular DTMF tone now - auto calls "flush"
    DTMFMediaStreamTrack.prototype.startTone = function(digit) {
        ASSERT(/^[0-9A-D#\*]$/.test(digit));
    }

    //------------------------------------------------------------------------
    // stops the current tone playing, must have called startTone
    DTMFMediaStreamTrack.prototype.stopTone = function() {
    }

    //------------------------------------------------------------------------
    // play a set of tones with specific durations and pause between tones
    DTMFMediaStreamTrack.prototype.playTones = function(tones) {
        ASSERT.isArray(tones);

        // FIX ME: if passed a stream, create an array with default durations

        ASSERT.isObject(tones[0]);
        ASSERT(/^[0-9A-D#\*,]$/.test(tones[0].digit));    // FIX ME: comma indicates a pause
        ASSERT.isNumber(tones[0].duration);
        ASSERT.isBoolean(tones[0].pause);
    }

    //------------------------------------------------------------------------
    // stops all tones playing, flushes any backlog of tones to be played
    DTMFMediaStreamTrack.prototype.flush = function() {
    }

    //------------------------------------------------------------------------
    // a tone on a track was discovered
    DTMFMediaStreamTrack.prototype.ontonestart = function(digit) {
        ASSERT(/^[0-9A-D#\*]$/.test(digit));
    }

    //------------------------------------------------------------------------
    // a tone on a track stopped playing
    DTMFMediaStreamTrack.prototype.ontonestop = function(digit, duration) {
        ASSERT(/^[0-9A-D#\*]$/.test(digit));    // NOTE: cannot receive a "pause" tone event
    }



    /* ########################################################################
     * # DataStream
     * ######################################################################## */

    var DataStream = function(options) {
        options = options || {};

        ASSERT.isObject(options);
        if (options.reliable) ASSERT.isBoolean(options.reliable);

        this.reliable = options.reliable || true;
        ASSERT.isBoolean(this.reliable)
    }

    //------------------------------------------------------------------------
    // notify data has been received from the network
    DataStream.prototype.onreceive = function(data) {
    }

    //------------------------------------------------------------------------
    // send data to the remote party
    DataStream.prototype.send = function(data) {
    }

    //------------------------------------------------------------------------
    // disconnect the data stream
    DataStream.prototype.close = function(data) {
    }



    /* ########################################################################
     * # Export public `ORTC` API (object-based RTC API).
     * ######################################################################## */

    return (ORTC = {
        MediaSocket: MediaSocket,
        DataSocket: DataSocket,
        MediaDataSocket: MediaDataSocket,
        Connection: Connection,
        DTMFMediaStreamTrack: DTMFMediaStreamTrack,
        DataStream: DataStream,
        // Allows for probing what features are supported by the browsers RTC engine.
        // Each feature refers to a particular set of well-known features which are fully supported.
        getFeatures: function() {
            return [
                "rtp",
                "dtls",
                "dtmf",
                "fec"
            ];
        },
        getConstraints: function(options) {
            return {
                "codecs": [
                    {
                        "payloadId": 0,
                        "kind": "audio",
                        "name": "<name>",
                        "hzRate": 32000,
                        "channels": 1
                    },
                    {
                        "payloadId": 0,
                        "kind": "video",
                        "name": "<name>",
                        "hzRate": 96000
                    }
                ],
                "crypto": [
                    {
                        // see SRTP RFC for algorithm names
                        "algorithm": "<type>",
                        "priority": 0,
//                        "mki": "<octects>",
                        "key": "<random>"
                    },
                    {
                        "algorithm": "<type>",
                        // auto-sort algorithm needed when no MKI for picking correct algorithm to use, e.g. sort priorty, sort key, sort algorithm
                        "priority": 0,
//                        "mki": "<octets>",
                        "key": "<random>"
                    }
                ],
                "required": {
                },
                "optional": {
                    "video": {
                        "maxWdith": -1,
                        "maxHeight": -1
                    }
                }
            };
        }
    });
}));
