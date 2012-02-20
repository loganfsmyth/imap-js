(function() {
  var Client, EventEmitter, constream, dateToDatetime, parser, tag, tagChars, util, _i, _results,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; },
    __slice = Array.prototype.slice;

  EventEmitter = require('events').EventEmitter;

  util = require('util');

  constream = require('./connection');

  parser = require('./parser');

  module.exports = Client = (function(_super) {
    var CommandError, CommandFailure, cmd, q;

    __extends(Client, _super);

    cmd = function(options) {
      return function() {
        var args, cb, _i;
        args = 2 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 1) : (_i = 0, []), cb = arguments[_i++];
        return this._handleCommand(options, args, cb);
      };
    };

    q = function(str) {
      return '"' + str.replace(/(["\\])/g, "\\$1") + '"';
    };

    Client.CommandError = CommandError = (function(_super2) {

      __extends(CommandError, _super2);

      function CommandError(resp) {
        this.name = "CommandError";
        this.message = resp.text.toString();
      }

      return CommandError;

    })(Error);

    Client.CommandFailure = CommandFailure = (function(_super2) {

      __extends(CommandFailure, _super2);

      function CommandFailure(resp) {
        this.name = "CommandFailure";
        this.message = resp.text.toString();
      }

      return CommandFailure;

    })(Error);

    Client.createClient = function(options, cb) {
      var client;
      if (typeof options === 'function') {
        cb = options;
        options = null;
      }
      client = new Client(options);
      if (cb) client.on('connect', cb);
      return client;
    };

    function Client(options) {
      var _this = this;
      Client.__super__.constructor.call(this);
      this._security = options.security;
      this._tagCount = 0;
      this.connected = false;
      this._response = {};
      this._respCallbacks = {};
      this._contQueue = [];
      this._con = options.stream || constream.createConnection(options);
      this._parser = parser.createParser(parser.CLIENT);
      this._con.pipe(this._parser);
      this._parser.on('greeting', function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return _this._onGreeting.apply(_this, args);
      });
      this._parser.on('tagged', function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return _this._onTagged.apply(_this, args);
      });
      this._parser.on('untagged', function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return _this._onUntagged.apply(_this, args);
      });
      this._parser.on('continuation', function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return _this._onContinuation.apply(_this, args);
      });
      this._parser.on('body', function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return _this._onBody.apply(_this, args);
      });
      this._con.on('timeout', function() {
        if (!_this.connected) {
          return _this.emit('connect', new Error('Timeout error'));
        } else {
          return _this.emit('close');
        }
      });
      this._con.on('error', function(e) {
        return _this.emit('error', e);
      });
      this._con.on('close', function(e) {
        return _this.emit('close', e);
      });
      this._con.on('end', function() {
        return _this.emit('close');
      });
      this.emitEnabled(options != null ? options.emit : void 0);
    }

    Client.prototype.emitEnabled = function(stat) {
      return this._parser.emitEnabled(stat);
    };

    Client.prototype._onGreeting = function(greeting) {
      var _this = this;
      if (this.connected) return;
      if (this._security === 'tls') {
        return this.starttls(function(e) {
          return _this.emit('connect', e);
        });
      } else {
        return this.emit('connect');
      }
    };

    Client.prototype._onTagged = function(resp) {
      var err, t;
      t = resp.tag;
      if (resp.type === 'BAD') {
        err = new CommandError(resp);
      } else if (resp.type === 'NO') {
        err = new CommandFailure(resp);
      }
      this._onUntagged(resp);
      this._response.text = resp.text;
      this._response.type = resp.type;
      resp = this._response;
      this._response = {};
      this._respCallbacks[t](err, resp);
      return delete this._respCallbacks[t];
    };

    Client.prototype._onUntagged = function(resp) {
      var code, type, val, value, _base, _base2, _base3, _base4, _base5, _base6, _name, _ref;
      type = resp.type.toUpperCase();
      switch (type) {
        case "OK":
        case "NO":
        case "BAD":
        case "BYE":
          code = resp['text-code'];
          value = {
            type: type,
            text: resp.text,
            key: code && code.key.toUpperCase(),
            value: code && code.value
          };
          if (code) {
            if ((_base = this._response).state == null) _base.state = {};
            this._response.state[value.key] = value;
          }
          return this._response.bye = type === 'BYE';
        case "CAPABILITY":
          if ((_base2 = this._response).state == null) _base2.state = {};
          return this._response.state['CAPABILITY'] = resp.value;
        case "FLAGS":
          return this._response.flags = resp.value;
        case "LIST":
        case "LSUB":
          return ((_ref = (_base3 = this._response)[_name = type.toLowerCase()]) != null ? _ref : _base3[_name] = []).push(resp.value);
        case "SEARCH":
          return this._response.search = resp.value;
        case "STATUS":
          val = resp.value;
          if ((_base4 = this._response).status == null) _base4.status = {};
          return this._response.status[val.mailbox] = val.attributes;
        case "EXISTS":
          return this._response.exists = resp.id;
        case "RECENT":
          return this._response.recent = resp.id;
        case "EXPUNGE":
          if ((_base5 = this._response).expunge == null) _base5.expunge = [];
          return this._response.expunge.push(resp.value);
        case "FETCH":
          if ((_base6 = this._response).fetch == null) _base6.fetch = {};
          return this._response.fetch[resp.id] = resp.value;
        default:
          return console.log("Unexpected response type: " + type);
      }
    };

    Client.prototype._onContinuation = function(resp) {
      var cb;
      cb = this._contQueue.shift();
      if (cb) {
        return cb();
      } else {
        return console.log('wtf??');
      }
    };

    Client.prototype._onBody = function(chunk, body, remaining, name) {
      return console.log(arguments);
    };

    Client.prototype._handleCommand = function(_arg, args, cb) {
      var command, cont, continue_cb, response, t,
        _this = this;
      command = _arg.command, response = _arg.response, cont = _arg["continue"];
      t = tag(++this._tagCount);
      if (typeof command === 'function') command = command.apply(this, args);
      command = t + ' ' + command + '\r\n';
      this._con.write(command);
      this._respCallbacks[t] = !response ? function(err, resp) {
        return cb(err, null, resp);
      } : function(err, resp) {
        return response.call(_this, err, resp, cb);
      };
      if (cont) {
        continue_cb = function() {
          return cont.apply(null, __slice.call(args).concat([function(err, buffer, more) {
            if (more) _this._contQueue.unshift(continue_cb);
            if (buffer && !err) {
              return _this._con.write(buffer);
            } else {
              return _this._con.write("\r\n", 'ascii');
            }
          }]));
        };
        this._contQueue.push(continue_cb);
      }
    };

    Client.prototype.capability = cmd({
      command: 'CAPABILITY',
      response: function(err, resp, cb) {
        var _ref;
        return cb(err, (_ref = resp.state) != null ? _ref['CAPABILITY'] : void 0, resp);
      }
    });

    Client.prototype.noop = cmd({
      command: 'NOOP'
    });

    Client.prototype.logout = cmd({
      command: 'LOGOUT',
      response: function(err, resp, cb) {
        if (!err) this._con.close();
        return cb(err, null, resp);
      }
    });

    Client.prototype.starttls = cmd({
      command: 'STARTTLS',
      response: function(err, resp, cb) {
        if (err) return cb(err, null, resp);
        return this._con.starttls(function(err) {
          return cb(err, null, resp);
        });
      }
    });

    Client.prototype.authenticate = cmd({
      command: function(mech) {
        return "AUTHENTICATE " + mech;
      }
    });

    Client.prototype.login = cmd({
      command: function(user, pass) {
        return "LOGIN " + (q(user)) + " " + (q(pass));
      }
    });

    Client.prototype.select = cmd({
      command: function(mailbox) {
        return "SELECT " + (q(mailbox));
      },
      response: function(err, resp, cb) {
        var _ref, _ref2, _ref3, _ref4;
        return cb(err, {
          flags: resp.flags,
          exists: resp.exists,
          recent: resp.recent,
          unseen: (_ref = resp.state['UNSEEN']) != null ? _ref.value : void 0,
          permanentflags: (_ref2 = resp.state['PERMANENTFLAGS']) != null ? _ref2.value : void 0,
          uidnext: (_ref3 = resp.state['UIDNEXT']) != null ? _ref3.value : void 0,
          uidvalidity: (_ref4 = resp.state['UIDVALIDITY']) != null ? _ref4.value : void 0
        }, resp);
      }
    });

    Client.prototype.examine = cmd({
      command: function(mailbox) {
        return "EXAMINE " + (q(mailbox));
      },
      response: function(err, resp, cb) {
        var _ref, _ref2, _ref3, _ref4;
        return cb(err, {
          flags: resp.flags,
          exists: resp.exists,
          recent: resp.recent,
          unseen: (_ref = resp.state['UNSEEN']) != null ? _ref.value : void 0,
          permanentflags: (_ref2 = resp.state['PERMANENTFLAGS']) != null ? _ref2.value : void 0,
          uidnext: (_ref3 = resp.state['UIDNEXT']) != null ? _ref3.value : void 0,
          uidvalidity: (_ref4 = resp.state['UIDVALIDITY']) != null ? _ref4.value : void 0
        }, resp);
      }
    });

    Client.prototype.create = cmd({
      command: function(mailbox) {
        return "CREATE " + (q(mailbox));
      }
    });

    Client.prototype["delete"] = cmd({
      command: function(mailbox) {
        return "DELETE " + (q(mailbox));
      }
    });

    Client.prototype.rename = cmd({
      command: function(mailbox, newmailbox) {
        return "RENAME " + (q(mailbox)) + " " + (q(newmailbox));
      }
    });

    Client.prototype.subscribe = cmd({
      command: function(mailbox) {
        return "SUBSCRIBE " + (q(mailbox));
      }
    });

    Client.prototype.unsubscribe = cmd({
      command: function(mailbox) {
        return "UNSUBSCRIBE " + (q(mailbox));
      }
    });

    Client.prototype.list = cmd({
      command: function(name, mailbox) {
        return "LIST " + (q(name)) + " " + (q(mailbox));
      },
      response: function(err, resp, cb) {
        return cb(err, resp.list, resp);
      }
    });

    Client.prototype.lsub = cmd({
      command: function(name, mailbox) {
        return "LSUB " + (q(name)) + " " + (q(mailbox));
      },
      response: function(err, resp, cb) {
        return cb(err, resp.lsub, resp);
      }
    });

    Client.prototype.status = cmd({
      command: function(mailbox, item_names) {
        return "STATUS " + (q(mailbox)) + " (" + (item_names.join(' ')) + ")";
      },
      response: function(err, resp, cb) {
        return cb(err, resp.status, resp);
      }
    });

    Client.prototype.append = cmd({
      command: function(mailbox, flags, datetime, bytes, stream) {
        var com;
        if (!Array.isArray(flags)) {
          stream = bytes;
          bytes = datetime;
          datetime = flags;
          flags = null;
        }
        if (!(datetime instanceof Date)) {
          stream = bytes;
          bytes = datetime;
          datetime = null;
        }
        if (stream) stream.pause();
        com = "APPEND " + (q(mailbox)) + " ";
        if (flags) com += "(" + (flags.join(' ')) + ") ";
        if (datetime) com += '"' + dateToDatetime(datetime) + '" ';
        com += '{';
        com += typeof bytes === 'string' ? Buffer.byteLength(bytes) : Buffer.isBuffer(bytes) ? bytes.length : bytes;
        com += '}';
        return com;
      },
      "continue": function(mailbox, flags, datetime, bytes, stream, cb) {
        if (!Array.isArray(flags)) {
          cb = stream;
          stream = bytes;
          bytes = datetime;
          datetime = flags;
          flags = null;
        }
        if (!(datetime instanceof Date)) {
          cb = stream;
          stream = bytes;
          bytes = datetime;
          datetime = null;
        }
        if (!cb) {
          cb = stream;
          stream = null;
        }
        if (stream) {
          stream.resume();
          stream.on('data', function(c) {
            return cb(null, c);
          });
          return stream.on('end', function() {
            return cb();
          });
        } else {
          cb(null, bytes);
          return cb();
        }
      }
    });

    Client.prototype.check = cmd({
      command: "CHECK"
    });

    Client.prototype.close = cmd({
      command: "CLOSE"
    });

    Client.prototype.expunge = cmd({
      command: "EXPUNGE",
      response: function(err, resp, cb) {
        return cb(err, resp.expunge, resp);
      }
    });

    Client.prototype.search = cmd({
      command: function(crit) {
        return 'SEARCH CHARSET UTF-8 ' + this._searchCriteria(crit);
      },
      response: function(err, resp, cb) {
        return cb(err, resp.search, resp);
      }
    });

    Client.prototype._searchCriteria = function(crit) {
      return crit;
    };

    Client.prototype.fetch = cmd({
      command: function(seq, crit) {
        var com;
        if (Array.isArray(seq)) seq = seq.join(',');
        seq = ('' + seq).replace(' ', '');
        com = "FETCH " + seq;
        return com += ' ' + this._fetchCriteria(crit);
      },
      response: function(err, resp, cb) {
        return cb(err, resp.fetch, resp);
      }
    });

    Client.prototype._fetchCriteria = function(crit) {
      return crit;
    };

    Client.prototype.store = cmd({
      command: function(seq, op, flags) {
        var com;
        if (Array.isArray(seq)) seq = seq.join(',');
        seq = ('' + seq).replace(' ', '');
        com = "STORE " + seq + ' ';
        com += (function() {
          switch (op) {
            case 'add':
              return '+';
            case 'set':
              return '';
            case 'del':
              return '-';
          }
        })();
        com += "FLAGS (" + (flags.join(' ')) + ")";
        return com;
      },
      response: function(err, resp, cb) {
        return cb(err, resp.fetch, resp);
      }
    });

    Client.prototype.copy = cmd({
      command: function(seq, mailbox) {
        if (Array.isArray(seq)) seq = seq.join(',');
        seq = ('' + seq).replace(' ', '');
        return "COPY " + seq + ' ' + q(mailbox);
      }
    });

    return Client;

  })(EventEmitter);

  tagChars = (new Buffer((function() {
    _results = [];
    for (var _i = 0x20; 0x20 <= 0x7E ? _i <= 0x7E : _i >= 0x7E; 0x20 <= 0x7E ? _i++ : _i--){ _results.push(_i); }
    return _results;
  }).apply(this))).toString().replace(/[\(\)\{ \\"%\*\+\]]/g, '');

  tag = function(tagCount) {
    var count, i, len, tagVal;
    count = tagCount++;
    len = tagChars.length;
    tagVal = '';
    while (count >= 1) {
      i = Math.floor(count % len);
      count /= len;
      tagVal = tagChars[i] + tagVal;
    }
    return tagVal;
  };

  dateToDatetime = function(d) {
    var com, hours, min, months;
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    com = '';
    if (d.getDate() < 10) com += '0';
    com += d.getDate() + '-';
    com += months[d.getMonth()] + '-';
    com += d.getFullYear() + ' ';
    if (d.getHours() < 10) com += '0';
    com += d.getHours() + ':';
    if (d.getMinutes() < 10) com += '0';
    com += d.getMinutes() + ':';
    if (d.getSeconds() < 10) com += '0';
    com += d.getSeconds();
    com += ' ';
    min = d.getTimezoneOffset();
    if (min < 0) {
      com += '-';
      min *= -1;
    } else {
      com += '+';
    }
    hours = min / 60;
    min = min % 60;
    if (hours < 10) com += '0';
    com += hours;
    if (min < 10) com += '0';
    com += min;
    return com;
  };

}).call(this);
