(function() {
  var Client, EventEmitter, constream, p, parser, util,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; },
    __slice = Array.prototype.slice;

  EventEmitter = require('events').EventEmitter;

  util = require('util');

  p = function(resp) {
    var i;
    for (i in resp) {
      if (!__hasProp.call(resp, i)) continue;
      if (Buffer.isBuffer(resp[i])) {
        resp[i] = resp[i].toString('utf8');
      } else if (typeof resp[i] === 'object') {
        p(resp[i]);
      }
    }
    return resp;
  };

  constream = require('./imap-connection');

  parser = require('./async-parser');

  module.exports = Client = (function(_super) {
    var CommandError, CommandFailure, cmd, q, tag, tagCount;

    __extends(Client, _super);

    tagCount = 0;

    tag = function() {
      return '' + tagCount;
    };

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
      client = new Client(options);
      if (cb) client.on('connect', cb);
      return client;
    };

    function Client(options) {
      var connected,
        _this = this;
      Client.__super__.constructor.call(this);
      this._respCallbacks = {};
      this._contQueue = [];
      if (options.host == null) options.host = 'localhost';
      if (options.security == null) options.security = 'none';
      this._security = options.security;
      this._con = options.stream || constream.createConnection(options.port, options.host, options.security === 'ssl');
      this._parser = parser.createParser(parser.CLIENT);
      this._con.on('data', function(c) {
        return console.log(c.toString('utf8'));
      });
      this._con.on('connect', function() {
        return _this._con.pipe(_this._parser);
      });
      connected = false;
      this._parser.on('greeting', function(greeting) {
        if (connected) return;
        connected = true;
        return _this._onGreeting(greeting);
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
      this._con.on('timeout', function() {
        if (!connected) {
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
    }

    Client.prototype._onGreeting = function(greeting) {
      var _this = this;
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
      t = resp.tag.toString('ascii');
      if (resp.type === 'BAD') {
        err = new CommandError(resp);
      } else if (resp.type === 'NO') {
        err = new CommandFailure(resp);
      }
      return this._respCallbacks[t](err, resp);
    };

    Client.prototype._onUntagged = function(resp) {
      return console.log(util.inspect(p(resp), false, 20, true));
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

    Client.prototype._handleCommand = function(_arg, args, cb) {
      var command, cont, response, t,
        _this = this;
      command = _arg.command, response = _arg.response, cont = _arg["continue"];
      t = tag();
      if (typeof command === 'function') command = command.apply(this, args);
      command = t + ' ' + command + '\r\n';
      console.log(command);
      this._con.write(command);
      this._respCallbacks[t] = !response ? cb : function(err, resp) {
        return response.call(_this, err, resp, cb);
      };
      if (cont) {
        this._contQueue.push(function() {
          return cont.apply(null, __slice.call(args).concat([function(err, buffer) {
            if (buffer && !err) {
              console.log('writing ' + buffer.length + ' bytes');
              return _this._con.write(buffer);
            } else {
              return _this._con.write("\r\n", 'ascii');
            }
          }]));
        });
      }
    };

    Client.prototype.capability = cmd({
      command: 'CAPABILITY'
    });

    Client.prototype.noop = cmd({
      command: 'NOOP'
    });

    Client.prototype.logout = cmd({
      command: 'LOGOUT',
      response: function(err, resp, cb) {
        if (!err) return this._con.close();
      }
    });

    Client.prototype.starttls = cmd({
      command: 'STARTTLS',
      response: function(err, resp, cb) {
        if (err) return cb(err);
        return this._con.starttls(function(err) {
          return cb(err, resp);
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
      }
    });

    Client.prototype.examine = cmd({
      command: function(mailbox) {
        return "EXAMINE " + (q(mailbox));
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
      }
    });

    Client.prototype.lsub = cmd({
      command: function(name, mailbox) {
        return "LSUB " + (q(name)) + " " + (q(mailbox));
      }
    });

    Client.prototype.status = cmd({
      command: function(mailbox, item_names) {
        return "STATUS " + (q(mailbox)) + " (" + (item_names.join(' ')) + ")";
      }
    });

    Client.prototype._dateToDatetime = function(d) {
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

    Client.prototype.append = cmd({
      command: function(mailbox, flags, datetime, bytes) {
        var com;
        if (!Array.isArray(flags)) {
          bytes = datetime;
          datetime = flags;
          flags = null;
        }
        if (!(datetime instanceof Date)) {
          bytes = datetime;
          datetime = null;
        }
        com = "APPEND " + (q(mailbox)) + " ";
        if (flags) com += "(" + (flags.join(' ')) + ") ";
        if (datetime) com += '"' + this._dateToDatetime(datetime) + '" ';
        com += '{';
        if (typeof bytes === 'string') {
          com += Buffer.byteLength(bytes);
        } else if (Buffer.isBuffer(bytes)) {
          com += bytes.length;
        }
        com += '}';
        return com;
      },
      "continue": function(mailbox, flags, datetime, bytes, cb) {
        if (!Array.isArray(flags)) {
          cb = bytes;
          bytes = datetime;
          datetime = flags;
          flags = null;
        }
        if (!(datetime instanceof Date)) {
          cb = bytes;
          bytes = datetime;
          datetime = null;
        }
        cb(null, bytes);
        return cb();
      }
    });

    Client.prototype.check = cmd({
      command: "CHECK"
    });

    Client.prototype.close = cmd({
      command: "CLOSE"
    });

    Client.prototype.expunge = cmd({
      command: "EXPUNGE"
    });

    Client.prototype._searchCriteria = function(crit) {
      return crit;
    };

    Client.prototype.search = cmd({
      command: function(crit) {
        return 'SEARCH CHARSET UTF-8 ' + this._searchCriteria(crit);
      }
    });

    Client.prototype._fetchCriteria = function(crit) {
      return crit;
    };

    Client.prototype.fetch = cmd({
      command: function(start, end, crit) {
        var com;
        if (!crit) {
          crit = end;
          end = null;
        }
        com = "FETCH " + start;
        if (end) com += ':' + end;
        return com += ' ' + this._fetchCriteria(crit);
      }
    });

    Client.prototype.store = cmd({
      command: function(start, end, op, flags) {
        var com;
        if (!flags) {
          flags = op;
          op = end;
          end = null;
        }
        com = "STORE " + start;
        if (end) com += ':' + end;
        com += ' ';
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
        com += 'FLAGS ';
        com += "(" + (flags.join(' ')) + ")";
        return com;
      }
    });

    Client.prototype.copy = cmd({
      command: function(start, end, mailbox) {
        var com;
        if (!mailbox) {
          mailbox = end;
          end = null;
        }
        com = "COPY " + start;
        if (end) com += ':' + end;
        com += q(mailbox);
        return com;
      }
    });

    Client.prototype.uid = cmd;

    return Client;

  })(EventEmitter);

}).call(this);
