(function() {
  var EventEmitter, ImapClient, ImapParser, STATE_AUTH, STATE_ERROR, STATE_LOGOUT, STATE_SELECT, STATE_UNAUTH, defineCommand, getCommandTag, i, imap_connection, stateStr, tagChars, util;
  var __slice = Array.prototype.slice, __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) {
    for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; }
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor;
    child.__super__ = parent.prototype;
    return child;
  }, __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
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
  /* Helpers
  */
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
  /* ImapClient class
  #
  */
  exports.ImapClient = ImapClient = (function() {
    __extends(ImapClient, EventEmitter);
    function ImapClient(host, port, security, options, cb) {
      ImapClient.__super__.constructor.call(this);
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      this.tag_counter = 1;
      this.responseCallbacks = {};
      this.continuationQueue = [];
      this.untagged = {};
      this.state = STATE_ERROR;
      this.stream = imap_connection.createClientConnection({
        port: port,
        host: host,
        security: security
      }, __bind(function(err) {
        if (err) {
          return this.emit('error', new Error(err));
        }
      }, this));
      this.stream.on('data', __bind(function(d) {
        return this._onData(d);
      }, this));
      if (cb) {
        this.on('greeting', cb);
      }
      this.parser = new ImapParser(ImapParser.GREETING);
      this.parser.onContinuation = __bind(function(resp) {
        return this._processContinuation(resp);
      }, this);
      this.parser.onUntagged = __bind(function(resp) {
        return this._processUntagged(resp);
      }, this);
      this.parser.onTagged = __bind(function(resp) {
        return this._processTagged(resp);
      }, this);
      this.parser.onGreeting = __bind(function(resp) {
        this.state = (function() {
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
          this.emit('bye', resp.text);
          return;
        }
        if (security === 'tls') {
          return this.starttls(__bind(function(err) {
            if (err) {
              return this.emit('error', new Error("Failed to establish TLS connection"));
            } else {
              return this.emit('greeting');
            }
          }, this));
        } else {
          return this.emit('greeting');
        }
      }, this);
    }
    ImapClient.prototype._onData = function(d) {
      console.log('Parsing --' + d.toString('utf8') + '--');
      try {
        return this.parser.execute(d);
      } catch (e) {
        return console.log(e);
      }
    };
    ImapClient.prototype._processUntagged = function(response) {
      var _base, _base2, _ref, _ref2;
      switch (response.type) {
        case 'CAPABILITY':
          return ((_ref = (_base = this.untagged)['capability']) != null ? _ref : _base['capability'] = []).push(response.value);
        case 'LIST':
          return ((_ref2 = (_base2 = this.untagged)['list']) != null ? _ref2 : _base2['list'] = [])[response.mailbox] = {
            path: response.mailbox.split(response.delim),
            flags: response['list-flags']
          };
        case 'LSUB':
          return this.untagged['lsub'] = '';
        case 'FLAGS':
          return this.untagged['flags'] = response.value;
        case 'EXISTS':
          return this.untagged['exists'] = response.value;
        case 'RECENT':
          return this.untagged['recent'] = response.value;
        case 'BYE':
          return this.untagged['bye'] = response.text.text;
      }
    };
    ImapClient.prototype._processContinuation = function(response) {
      var handler;
      handler = this.continuationQueue.shift();
      return handler(response, __bind(function(result) {
        if (result) {
          this.stream.write(result + '\r\n');
          return this.continuationQueue.unshift(handler);
        }
      }, this));
    };
    ImapClient.prototype._processTagged = function(response) {
      var _ref;
      if ((_ref = this.responseCallbacks[response.tag]) != null) {
        _ref.call(this, (response.type !== 'OK' ? response.type : null), response.text);
      }
      delete this.responseCallbacks[response.tag];
      return this.untagged = {};
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
        if (err) {
          this.state = STATE_LOGOUT;
        }
        return cb(err, resp);
      }
    });
    ImapClient.prototype.starttls = defineCommand({
      state: STATE_UNAUTH,
      command: 'STARTTLS',
      response: function(err, resp, cb) {
        if (err) {
          return cb(err, resp);
        }
        this.stream = this.stream.starttls(__bind(function(err) {
          return cb(err);
        }, this));
        return this.stream.on('data', __bind(function(d) {
          return this._onData(d);
        }, this));
      }
    });
    ImapClient.prototype.authenticate = defineCommand({
      state: STATE_UNAUTH,
      command: 'AUTHENTICATE',
      response: function(err, resp, cb) {}
    });
    ImapClient.prototype.login = defineCommand({
      state: STATE_UNAUTH,
      command: function(user, pass) {
        return "LOGIN " + user + " " + pass;
      },
      response: function(err, resp, cb) {
        if (!err) {
          this.state = STATE_AUTH;
        }
        return cb(err, resp);
      }
    });
    ImapClient.prototype.select = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "SELECT " + mailbox;
      },
      response: function(err, resp, cb) {
        if (err) {
          this.state = STATE_SELECT;
        }
        return cb(err, resp);
      }
    });
    ImapClient.prototype.examine = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "EXAMINE " + mailbox;
      }
    });
    ImapClient.prototype.create = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "CREATE " + mailbox;
      }
    });
    ImapClient.prototype["delete"] = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "DELETE " + mailbox;
      }
    });
    ImapClient.prototype.rename = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox, newmailbox) {
        return "RENAME " + mailbox + " " + newmailbox;
      }
    });
    ImapClient.prototype.subscribe = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "SUBSCRIBE " + mailbox;
      }
    });
    ImapClient.prototype.unsubscribe = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox) {
        return "UNSUBSCRIBE " + mailbox;
      }
    });
    ImapClient.prototype.list = defineCommand({
      state: STATE_AUTH,
      command: function(refname, mailbox) {
        return "LIST " + refname + " " + mailbox;
      }
    });
    ImapClient.prototype.lsub = defineCommand({
      state: STATE_AUTH,
      command: function(refname, mailbox) {
        return "LSUB " + refname + " " + mailbox;
      }
    });
    ImapClient.prototype.status = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox, items) {
        return "STATUS " + mailbox + " (" + (items.join(' ')) + ")";
      }
    });
    ImapClient.prototype.append = defineCommand({
      state: STATE_AUTH,
      command: function(mailbox, flags, datetime, message) {
        return "APPEND " + mailbox + " (" + (flags.join(' ')) + ") " + datetime + "{" + (new Buffer(message, 'utf8')).length + "}";
      },
      "continue": function() {
        var arg, cb, message, resp, _i;
        resp = arguments[0], cb = arguments[1], arg = 4 <= arguments.length ? __slice.call(arguments, 2, _i = arguments.length - 1) : (_i = 2, []), message = arguments[_i++];
        return cb(message);
      }
    });
    ImapClient.prototype.check = defineCommand({
      state: STATE_AUTH,
      command: "CHECK"
    });
    ImapClient.prototype.close = defineCommand({
      state: STATE_AUTH,
      command: "CLOSE"
    });
    ImapClient.prototype.expunge = defineCommand({
      state: STATE_AUTH,
      command: "EXPUNGE"
    });
    ImapClient.prototype.search = defineCommand({
      state: STATE_AUTH,
      command: function(charset, criteria) {
        return "SEARCH " + charset + " " + criteria;
      }
    });
    ImapClient.prototype.fetch = defineCommand({
      state: STATE_AUTH,
      command: function(seqset, item_names) {
        return "FETCH " + seqset + " " + item_names;
      }
    });
    ImapClient.prototype.store = defineCommand({
      state: STATE_AUTH,
      command: function(seqset, item_name, value) {
        return "STORE " + seqset + " " + item_name + " " + value;
      }
    });
    ImapClient.prototype.copy = defineCommand({
      state: STATE_AUTH,
      command: function(seqset, mailbox) {
        return "COPY " + seqset + " " + mailbox;
      }
    });
    ImapClient.prototype.uid = defineCommand({
      state: STATE_AUTH,
      command: function() {
        var args, command;
        command = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
        return "UID " + command + " " + (args.join(' '));
      }
    });
    ImapClient.prototype["in"] = function() {};
    ImapClient.prototype.out = function() {};
    ImapClient.prototype.caps = function() {};
    ImapClient.prototype.boxes = function() {};
    return ImapClient;
  })();
}).call(this);
