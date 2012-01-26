(function() {
  var ConnectionStream, Stream, crypto, net, pipe, tls,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; },
    __slice = Array.prototype.slice;

  tls = require('tls');

  net = require('net');

  crypto = require('crypto');

  Stream = require('stream');

  module.exports = ConnectionStream = (function(_super) {

    __extends(ConnectionStream, _super);

    ConnectionStream.createConnection = function(port, host, secure, cb) {
      return new ConnectionStream(port, host, secure, cb);
    };

    function ConnectionStream(port, host, secure, cb) {
      var _this = this;
      this.secure = secure;
      if (this.secure) {
        if (port == null) port = 993;
        this._stream = tls.connect(options.port, options.host, options.tls, function() {
          return _this.emit('connect');
        });
        this.socket = this._stream.socket;
      } else {
        if (port == null) port = 143;
        this.socket = this._stream = net.createConnection(options.port, options.host, function() {
          return _this.emit('connect');
        });
      }
      this._bindListeners();
    }

    ConnectionStream.prototype.starttls = function(options, cb) {
      var pair, sslcontext,
        _this = this;
      if (this.secure) return process.nextTick(cb);
      if (typeof options === 'function') {
        cb = options;
        options = null;
      }
      sslcontext = crypto.createCredentials(options);
      pair = tls.createSecurePair(sslcontext, options.server, options.requestCert, options.rejectUnauthorized);
      this._stream.removeListener('data', this._boundListeners['data']);
      this._stream = pipe(pair, this.socket);
      pair.on('secure', function() {
        var verifyError;
        verifyError = pair.ssl.verifyError();
        _this._stream.npnProtocol = pair.npnProtocol;
        if (verifyError) {
          _this._stream.authorized = false;
          _this._stream.authorizationError = verifyError;
        } else {
          _this._stream.authorized = true;
        }
        return cleartext.emit('secureConnect');
      });
      return this._stream.on('secureConnect', function() {
        _this._stream.on('data', _this._boundListeners['data']);
        if (!_this._stream.authorized && !options.allowUnauthorized) {
          return cb(_this._stream.authorizationError);
        } else {
          return cb;
        }
      });
    };

    ConnectionStream.prototype._bindListeners = function() {
      var cb, e, _fn, _i, _len, _ref, _ref2, _results,
        _this = this;
      this._boundListeners = {};
      _ref = ['data', 'end', 'error', 'close', 'drain', 'pipe'];
      _fn = function(e) {
        return _this._boundListeners[e] = function() {
          var args;
          args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
          return _this.emit.apply(_this, [e].concat(__slice.call(args)));
        };
      };
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        e = _ref[_i];
        _fn(e);
      }
      _ref2 = this._boundListeners;
      _results = [];
      for (e in _ref2) {
        cb = _ref2[e];
        _results.push(this._stream.on(e, cb));
      }
      return _results;
    };

    ConnectionStream.prototype._unbindListeners = function() {
      var cb, e, _ref, _results;
      _ref = this._boundListeners;
      _results = [];
      for (e in _ref) {
        cb = _ref[e];
        _results.push(this._stream.removeListener(e, cb));
      }
      return _results;
    };

    ConnectionStream.prototype.setEncoding = function(enc) {
      return this._stream.setEncoding(enc);
    };

    ConnectionStream.prototype.pause = function() {
      return this._stream.pause();
    };

    ConnectionStream.prototype.resume = function() {
      return this._stream.resume();
    };

    ConnectionStream.prototype.write = function(buffer, enc) {
      return this._stream.write(buffer, enc);
    };

    ConnectionStream.prototype.end = function(buffer, enc) {
      return this._stream.end(buffer, enc);
    };

    ConnectionStream.prototype.destroy = function() {
      return this._stream.destroy();
    };

    ConnectionStream.prototype.destroySoon = function() {
      return this._stream.destroySoon();
    };

    return ConnectionStream;

  })(Stream);

  ConnectionStream.prototype.__defineGetter__('writable', function() {
    return this._stream.writable;
  });

  ConnectionStream.prototype.__defineGetter__('readable', function() {
    return this._stream.readable;
  });

  pipe = function(pair, socket) {
    var cleartext, onclose, onerror, ontimeout;
    pair.encrypted.pipe(socket);
    socket.pipe(pair.encrypted);
    pair.fd = socket.fd;
    cleartext = pair.cleartext;
    cleartext.socket = socket;
    cleartext.encrypted = pair.encrypted;
    cleartext.authorized = false;
    onerror = function(e) {
      if (cleartext._controlReleased) return cleartext.emit('error', e);
    };
    onclose = function() {
      socket.removeListener('error', onerror);
      socket.removeListener('close', onclose);
      return socket.removeListener('timeout', ontimeout);
    };
    ontimeout = function() {
      return cleartext.emit('timeout');
    };
    socket.on('error', onerror);
    socket.on('close', onclose);
    socket.on('timeout', ontimeout);
    return cleartext;
  };

}).call(this);
