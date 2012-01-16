(function() {
  var EventEmitter, ImapClient, ImapParser, STATE_AUTH, STATE_ERROR, STATE_LOGOUT, STATE_SELECT, STATE_UNAUTH, defineCommand, getCommandTag, i, imap_connection, stateStr, tagChars, util,
    __slice = Array.prototype.slice,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  ImapParser = require('./imap-parser').ImapParser;

  EventEmitter = require('events').EventEmitter;

  imap_connection = require('./imap-connection');

  util = require('util');

  STATE_ERROR = 0x0;

  STATE_UNAUTH = 0x1;

  STATE_AUTH = 0x2;

  STATE_SELECT = 0x4;

  STATE_LOGOUT = 0x8;

  stateStr = function(state) {
    switch (state) {
      case STATE_ERROR:
        return "Error";
      case STATE_UNAUTH:
        return "Unauth";
      case STATE_AUTH:
        return "Auth";
      case STATE_SELECT:
        return "Select";
      case STATE_LOGOUT:
        return "Logout";
    }
  };

  defineCommand = function(_arg) {
    var command_cb, continue_cb, response_cb, state, states;
    state = _arg.state, command_cb = _arg.command, response_cb = _arg.response, continue_cb = _arg["continue"];
    states = [STATE_ERROR, STATE_LOGOUT, STATE_UNAUTH, STATE_AUTH, STATE_SELECT];
    return function() {
      var args, cb, command, stateName, tag, _i;
      args = 2 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 1) : (_i = 0, []), cb = arguments[_i++];
      if (states.indexOf(state) > states.indexOf(this.state)) {
        stateName = stateStr(state);
        cb.call(this, new Error("This command is not available in the " + stateName + " state."));
        return;
      }
      tag = getCommandTag(this.tag_counter++);
      this.responseCallbacks[tag] = !response_cb ? cb : function() {
        var resp_args;
        resp_args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return response_cb.call.apply(response_cb, [this].concat(__slice.call(resp_args), [cb]));
      };
      if (continue_cb) {
        this.continuationQueue.push(function() {
          var cont_args;
          cont_args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
          return continue_cb.call.apply(continue_cb, [this].concat(__slice.call(cont_args), __slice.call(args)));
        });
      }
      command = typeof command_cb === 'function' ? command_cb.apply(this, args) : command_cb;
      this.stream.write(tag + ' ' + command + '\r\n');
      return console.log(command);
    };
  };

  tagChars = (function() {
    var _ref, _results;
    _results = [];
    for (i = 0x20; 0x20 <= 0x7E ? i <= 0x7E : i >= 0x7E; 0x20 <= 0x7E ? i++ : i--) {
      if ((_ref = String.fromCharCode(i)) !== '(' && _ref !== ')' && _ref !== '{' && _ref !== ' ' && _ref !== '\\' && _ref !== '"' && _ref !== '%' && _ref !== '*' && _ref !== '+' && _ref !== ']') {
        _results.push(String.fromCharCode(i));
      }
    }
    return _results;
  })();

  getCommandTag = function(count) {
    var len, tag;
    len = tagChars.length;
    tag = '';
    while (count >= 1) {
      i = Math.floor(count % len);
      count /= len;
      tag = tagChars[i] + tag;
    }
    return tag;
  };

  exports.ImapClient = ImapClient = (function(_super) {

    __extends(ImapClient, _super);

    function ImapClient(host, port, security, options, cb) {
      var _this = this;
      ImapClient.__super__.constructor.call(this);
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      this.testing = !host && !port && !security;
      this.tag_counter = 1;
      this.responseCallbacks = {};
      this.continuationQueue = [];
      this.state = STATE_ERROR;
      this.response = {};
      if (cb) this.on('greeting', cb);
      this.parser = new ImapParser(ImapParser.GREETING);
      this.parser.onContinuation = function(resp) {
        return _this._processContinuation(resp);
      };
      this.parser.onUntagged = function(resp) {
        return _this._processUntagged(resp);
      };
      this.parser.onTagged = function(resp) {
        return _this._processTagged(resp);
      };
      this.parser.onGreeting = function(resp) {
        _this.state = (function() {
          switch (resp.type) {
            case 'BYE':
              return STATE_LOGOUT;
            case 'PREAUTH':
              return STATE_AUTH;
            default:
              return STATE_UNAUTH;
          }
        })();
        if (resp.type === 'BYE') {
          _this.emit('bye', resp.text);
          return;
        }
        if (security === 'tls') {
          return _this.starttls(function(err) {
            if (err) {
              return _this.emit('error', new Error("Failed to establish TLS connection"));
            } else {
              return _this.emit('greeting');
            }
          });
        } else {
          return _this.emit('greeting');
        }
      };
      if (this.testing) {
        this.parser.reinitialize(ImapParser.RESPONSE);
        this.state = STATE_SELECT;
        getCommandTag = function() {
          return 'tag';
        };
        this.stream = {
          write: function() {}
        };
        process.nextTick(function() {
          return _this.emit('greeting');
        });
      } else {
        this.stream = imap_connection.createClientConnection({
          port: port,
          host: host,
          security: security,
          tlsoptions: options,
          timeout: 500
        }, function(err) {
          if (err) return _this.emit('error', new Error(err));
        });
        this.stream.on('data', function(d) {
          return _this._onData(d);
        });
      }
    }

    ImapClient.prototype._onData = function(data) {
      return this.parser.execute(data);
    };

    ImapClient.prototype._processTextCode = function(response) {
      var _base, _ref, _ref2;
      if (((_ref = response.textcode) != null ? _ref.type : void 0) === 'CAPABILITY') {
        this.response.capability = response.textcode.value;
      }
      if (response.textcode) {
        return ((_ref2 = (_base = this.response)['textcodes']) != null ? _ref2 : _base['textcodes'] = {})[response.textcode.type] = {
          type: response.textcode.type,
          value: response.textcode.value,
          state: response.type,
          text: response.text
        };
      }
    };

    ImapClient.prototype._processUntagged = function(response) {
      var att, obj, _base, _base2, _base3, _base4, _i, _len, _ref, _ref2, _ref3, _ref4, _ref5, _results;
      switch (response.type) {
        case 'CAPABILITY':
          return this.response['capability'] = response.value;
        case 'LIST':
          return ((_ref = (_base = this.response)['list']) != null ? _ref : _base['list'] = {})[response.mailbox] = {
            path: response.mailbox.split(response.delim),
            flags: response['list-flags'],
            delim: response.delim
          };
        case 'LSUB':
          return ((_ref2 = (_base2 = this.response)['lsub']) != null ? _ref2 : _base2['lsub'] = {})[response.mailbox] = {
            path: response.mailbox.split(response.delim),
            flags: response['list-flags'],
            delim: response.delim
          };
        case 'STATUS':
          return this.response['status'] = response.attrs;
        case 'EXPUNGE':
          return ((_ref3 = (_base3 = this.response)['expunge']) != null ? _ref3 : _base3['expunge'] = []).push(response.value);
        case 'SEARCH':
          return this.response['search'] = response.value;
        case 'FLAGS':
          return this.response['flags'] = response.value;
        case 'EXISTS':
          return this.response['exists'] = response.value;
        case 'RECENT':
          return this.response['recent'] = response.value;
        case 'FETCH':
          obj = ((_ref4 = (_base4 = this.response)['fetch']) != null ? _ref4 : _base4['fetch'] = {})[response.value] = {};
          _ref5 = response['msg-att'];
          _results = [];
          for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
            att = _ref5[_i];
            _results.push(obj[att.name.toLowerCase()] = att.value);
          }
          return _results;
          break;
        case 'OK':
        case 'BAD':
        case 'PREAUTH':
        case 'BYE':
        case 'NO':
          return this._processTextCode(response);
      }
    };

    ImapClient.prototype._processContinuation = function(response) {
      var handler,
        _this = this;
      handler = this.continuationQueue.shift();
      return handler(response, function(result) {
        if (result) {
          _this.stream.write(result + '\r\n');
          return _this.continuationQueue.unshift(handler);
        }
      });
    };

    ImapClient.prototype._processTagged = function(response) {
      var _ref;
      this._processTextCode(response);
      this.response.type = response.type;
      this.response.text = response.text;
      if ((_ref = this.responseCallbacks[response.tag]) != null) {
        _ref.call(this, (response.type !== 'OK' ? response.type : null), this.response);
      }
      delete this.responseCallbacks[response.tag];
      return this.response = {};
    };

    ImapClient.prototype.capability = defineCommand({
      state: STATE_UNAUTH,
      command: 'CAPABILITY'
    });

    ImapClient.prototype.noop = defineCommand({
      state: STATE_UNAUTH,
      command: 'NOOP'
    });

    ImapClient.prototype.logout = defineCommand({
      state: STATE_UNAUTH,
      command: 'LOGOUT',
      response: function(err, resp, cb) {
        if (err) this.state = STATE_LOGOUT;
        return cb(err, resp);
      }
    });

    ImapClient.prototype.starttls = defineCommand({
      state: STATE_UNAUTH,
      command: 'STARTTLS',
      response: function(err, resp, cb) {
        var _this = this;
        if (err) return cb(err, resp);
        this.stream = this.stream.starttls(function(err) {
          return cb(err);
        });
        return this.stream.on('data', function(d) {
          return _this._onData(d);
        });
      }
    });

    ImapClient.prototype.authenticate = defineCommand({
      state: STATE_UNAUTH,
      command: 'AUTHENTICATE'
    });

    ImapClient.prototype.login = defineCommand({
      state: STATE_UNAUTH,
      command: function(user, pass) {
        return "LOGIN \"" + user + "\" \"" + pass + "\"";
      },
      response: function(err, resp, cb) {
        if (!err) this.state = STATE_AUTH;
        return cb(err, resp);
      }
    });

    ImapClient.prototype.select = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "SELECT \"" + mailbox + "\"";
      },
      response: function(err, resp, cb) {
        if (!err) this.state = STATE_SELECT;
        return cb(err, resp);
      }
    });

    ImapClient.prototype.examine = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "EXAMINE \"" + mailbox + "\"";
      }
    });

    ImapClient.prototype.create = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "CREATE \"" + mailbox + "\"";
      }
    });

    ImapClient.prototype["delete"] = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "DELETE \"" + mailbox + "\"";
      }
    });

    ImapClient.prototype.rename = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox, newmailbox) {
        return "RENAME \"" + mailbox + "\" \"" + newmailbox + "\"";
      }
    });

    ImapClient.prototype.subscribe = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "SUBSCRIBE \"" + mailbox + "\"";
      }
    });

    ImapClient.prototype.unsubscribe = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "UNSUBSCRIBE \"" + mailbox + "\"";
      }
    });

    ImapClient.prototype.list = defineCommand({
      state: STATE_AUTH,
      command: function(refname, mailbox) {
        return "LIST \"" + refname + "\" \"" + mailbox + "\"";
      }
    });

    ImapClient.prototype.lsub = defineCommand({
      state: STATE_AUTH,
      command: function(refname, mailbox) {
        return "LSUB \"" + refname + "\" \"" + mailbox + "\"";
      }
    });

    ImapClient.prototype.status = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox, items) {
        return "STATUS \"" + mailbox + "\" (" + (items.join(' ')) + ")";
      }
    });

    ImapClient.prototype.append = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox, message, flags, datetime) {
        if (flags == null) flags = [];
        if (datetime == null) datetime = '';
        return "APPEND \"" + mailbox + "\" (" + (flags.join(' ')) + ") " + datetime + "{" + (new Buffer(message, 'utf8')).length + "}";
      },
      "continue": function() {
        var arg, cb, message, resp, _i;
        resp = arguments[0], cb = arguments[1], arg = 4 <= arguments.length ? __slice.call(arguments, 2, _i = arguments.length - 1) : (_i = 2, []), message = arguments[_i++];
        return cb(message);
      }
    });

    ImapClient.prototype.check = defineCommand({
      state: STATE_SELECT,
      command: "CHECK"
    });

    ImapClient.prototype.close = defineCommand({
      state: STATE_SELECT,
      command: "CLOSE"
    });

    ImapClient.prototype.expunge = defineCommand({
      state: STATE_SELECT,
      command: "EXPUNGE"
    });

    ImapClient.prototype.search = defineCommand({
      state: STATE_SELECT,
      command: function(criteria, charset, uid) {
        if (charset == null) charset = '';
        if (uid) uid = 'UID ';
        return uid + ("SEARCH " + (charset ? "CHARSET " + charset : void 0) + " " + criteria);
      }
    });

    ImapClient.prototype.fetch = defineCommand({
      state: STATE_SELECT,
      command: function(seqset, items, uid) {
        return (uid ? 'UID ' : '') + ("FETCH " + seqset + " " + (items.join(' ')));
      }
    });

    ImapClient.prototype.store = defineCommand({
      state: STATE_SELECT,
      command: function(seqset, action, flags, uid) {
        var act;
        act = (function() {
          switch (action) {
            case '+':
              return '+FLAGS';
            case '-':
              return '-FLAGS';
            default:
              return 'FLAGS';
          }
        })();
        return (uid ? 'UID ' : '') + ("STORE " + seqset + " " + act + " (" + (flags.join(' ')) + ")");
      }
    });

    ImapClient.prototype.copy = defineCommand({
      state: STATE_SELECT,
      command: function(seqset, mailbox, uid) {
        return (uid ? 'UID ' : '') + ("COPY " + seqset + " \"" + mailbox + "\"");
      }
    });

    ImapClient.prototype["in"] = function(user, password, cb) {
      return this.login(user, password, cb);
    };

    ImapClient.prototype.out = function(cb) {
      return this.logout(cb);
    };

    ImapClient.prototype.auth = function(mechanism) {};

    ImapClient.prototype.caps = function(cb) {};

    ImapClient.prototype.boxes = function(_arg, cb) {
      var unread;
      unread = _arg.unread;
    };

    return ImapClient;

  })(EventEmitter);

}).call(this);
