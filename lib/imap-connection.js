(function() {
  var crypto, net, pipe, starttls, tls;

  tls = require('tls');

  net = require('net');

  crypto = require('crypto');

  pipe = function(pair, socket) {
    var cleartext, onclose, onerror;
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
      return socket.removeListener('close', onclose);
    };
    socket.on('error', onerror);
    socket.on('close', onclose);
    return cleartext;
  };

  starttls = function(socket, options, cb) {
    var pair, sslcontext, stream;
    sslcontext = crypto.createCredentials(options);
    pair = tls.createSecurePair(sslcontext, options != null ? options.server : void 0, options != null ? options.requestCert : void 0, options != null ? options.rejectUnauthorized : void 0);
    socket.removeAllListeners('data');
    stream = pipe(pair, socket);
    pair.on('secure', function() {
      if (!stream.authorized && !options.allowUnauthorized) {
        return cb(stream.authorizationError);
      } else {
        return cb;
      }
    });
    return stream;
  };

  exports.createClientConnection = function(_arg, cb) {
    var connected, host, port, security, socket, stream, timeout, tlsoptions;
    port = _arg.port, host = _arg.host, security = _arg.security, timeout = _arg.timeout, tlsoptions = _arg.tlsoptions;
    if (port == null) port = 143;
    if (host == null) host = '127.0.0.1';
    if (security == null) security = null;
    if (timeout == null) timeout = 1000;
    if (typeof options === "undefined" || options === null) options = {};
    connected = false;
    if (security === 'ssl') {
      stream = tls.connect(port, host, tlsoptions, function() {
        connected = true;
        if (cb && !stream.authorized && !tlsoptions.allowUnauthorized) {
          return cb(stream.authorizationError);
        }
      });
      socket = stream.socket;
    } else {
      stream = socket = net.createConnection(port, host);
      stream.on('connect', function() {
        connected = true;
        if (cb) return cb;
      });
    }
    socket.setTimeout(timeout, function() {
      if (cb && !connected) return cb('timeout');
    });
    socket.setKeepAlive(true);
    if (security === 'tls') {
      stream.starttls = function(callback) {
        return starttls(stream, options, callback);
      };
    }
    return stream;
  };

  exports.createServerConnection = function(_arg) {
    var cb, options, security, server;
    security = _arg.security, options = _arg.options, cb = _arg.cb;
    if (typeof port === "undefined" || port === null) port = 143;
    if (typeof host === "undefined" || host === null) host = '127.0.0.1';
    if (security == null) security = null;
    if (options == null) options = {};
    if (security === 'ssl') {
      server = tls.createServer(options, cb);
    } else {
      server = net.createServer(options, cb);
    }
    server.listen(port, ip);
    return server;
  };

}).call(this);
