(function() {
  var Client, EventEmitter, Mailbox, Message, MessageSet, OOClient,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  EventEmitter = require('events').EventEmitter;

  Client = require('./client');

  module.exports = OOClient = (function(_super) {

    __extends(OOClient, _super);

    function OOClient() {
      OOClient.__super__.constructor.apply(this, arguments);
    }

    OOClient.createClient = function(options, cb) {
      var c;
      c = new OOClient(options);
      if (cb) c.on('connect', cb);
      return c;
    };

    OOClient.prototype.box = function(name, sep, flags) {
      return new Mailbox(this, name, sep, flags);
    };

    OOClient.prototype.boxes = function(name, pat, subs, cb) {
      var handler,
        _this = this;
      if (!cb) {
        cb = subs;
        subs = null;
      }
      handler = function(err, boxes) {
        var b, results, _i, _len;
        results = {};
        if (!err) {
          for (_i = 0, _len = boxes.length; _i < _len; _i++) {
            b = boxes[_i];
            results[b.mailbox] = new Mailbox(_this, b.mailbox, b.char, b.flags);
          }
        }
        return cb(err, results);
      };
      if (subs) {
        return this.lsub(name, pat, handler);
      } else {
        return this.list(name, pat, handler);
      }
    };

    return OOClient;

  })(Client);

  Mailbox = (function(_super) {

    __extends(Mailbox, _super);

    function Mailbox(client, name, sep, flags) {
      var _this = this;
      this.client = client;
      this.name = name;
      this.sep = sep;
      this.flags = flags;
      this.autoexpunge = false;
      this.selected = false;
      this.client.on('unselect', function() {
        _this.selected = false;
        return _this.emit('unselect');
      });
      this.on('select', function() {
        return _this.selected = true;
      });
    }

    Mailbox.prototype.select = function(cb) {
      var _this = this;
      if (this.selected) return process.nextTick(cb);
      this.client.emit('unselect');
      return this.client.select(this.name, function(err, info) {
        _this.flags = info.flags, _this.exist = info.exist, _this.recent = info.recent, _this.unseen = info.unseen, _this.permanentflags = info.permanentflags, _this.uidnext = info.uidnext, _this.uidvalidity = info.uidvalidity;
        if (!err) _this.emit('select');
        return cb(err);
      });
    };

    Mailbox.prototype.rename = function(name, cb) {
      if (name === this.name) return process.nextTick(cb);
      return this.client.rename(this.name, name, function(err) {
        if (!err) this.name = name;
        return cb(err);
      });
    };

    Mailbox.prototype["delete"] = function(cb) {
      return this.client["delete"](this.name, name, function(err) {
        if (!err) this.emit('delete');
        return cb(err);
      });
    };

    Mailbox.prototype.update = function(cb) {
      var atts,
        _this = this;
      if (this.selected) {
        return this.client.noop(function(err, _, resp) {
          var _ref, _ref2, _ref3, _ref4;
          if (resp.flags != null) _this.flags = resp.flags;
          if (resp.exists != null) _this.exists = resp.exists;
          if (resp.recent != null) _this.recent = resp.recent;
          if (resp.state['UNSEEN'] != null) {
            _this.unseen = (_ref = resp.state['UNSEEN']) != null ? _ref.value : void 0;
          }
          if (resp.state['PERMANENTFLAGS'] != null) {
            _this.permanentflags = (_ref2 = resp.state['PERMANENTFLAGS']) != null ? _ref2.value : void 0;
          }
          if (resp.state['UIDNEXT'] != null) {
            _this.uidnext = (_ref3 = resp.state['UIDNEXT']) != null ? _ref3.value : void 0;
          }
          if (resp.state['UIDVALIDITY'] != null) {
            return _this.uidvalidity = (_ref4 = resp.state['UIDVALIDITY']) != null ? _ref4.value : void 0;
          }
        });
      } else {
        atts = ['messages', 'recent', 'uidnext', 'uidvalidity', 'unseen'];
        return this.client.status(this.name, atts, function(err, vals) {
          _this.recent = vals.recent, _this.uidnext = vals.uidnext, _this.uidvalidity = vals.uidvalidity, _this.unseen = vals.unseen;
          return _this.exists = vals.messages;
        });
      }
    };

    Mailbox.prototype.expunge = function(cb) {
      return this.client.expunge(this.name, cb);
    };

    Mailbox.prototype.sub = function(cb) {
      return this.client.subscribe(this.name, cb);
    };

    Mailbox.prototype.unsub = function(cb) {
      return this.client.subscribe(this.name, cb);
    };

    Mailbox.prototype.search = function(criteria, cb) {
      var _this = this;
      return this.client.search(criteria, true, function(err, ids) {
        return cb(err, new MessageSet(_this.client, ids));
      });
    };

    Mailbox.prototype.range = function(start, end, cb) {
      var _this = this;
      if (typeof end === 'function') {
        cb = end;
        end = '*';
      }
      return this.client.search("" + start + ":" + end, true, function(err, ids, resp) {
        return cb(err, ids ? new MessageSet(_this.client, ids) : void 0);
      });
    };

    Mailbox.prototype.load = function(uid, cb) {
      return cb(null, new Message(this.client, uid));
    };

    return Mailbox;

  })(EventEmitter);

  MessageSet = (function(_super) {

    __extends(MessageSet, _super);

    function MessageSet(client, sequence) {
      this.client = client;
      this.sequence = sequence;
    }

    MessageSet.prototype.setflags = function(flags, cb) {
      return this.client.store(this.sequence, 'set', flags, true, cb);
    };

    MessageSet.prototype.addflags = function(flags, cb) {
      return this.client.store(this.sequence, 'add', flags, true, cb);
    };

    MessageSet.prototype.delflags = function(flags, cb) {
      return this.client.store(this.sequence, 'del', flags, true, cb);
    };

    MessageSet.prototype.copyTo = function(mailbox, cb) {
      return this.client.copy(this.sequence, mailbox, true, cb);
    };

    MessageSet.prototype.search = function(criteria, cb) {
      var _this = this;
      criteria + ' UID ' + this.sequence;
      return this.client.search(criteria, function(err, ids) {
        return cb(err, new MessageSet(_this.client, ids));
      });
    };

    MessageSet.prototype.load = function(cb) {
      var _this = this;
      return this.client.fetch(this.sequence, 'ENVELOPE FLAGS INTERNALDATE UID', true, function(err, msgs) {
        var k, m, messages, msg;
        messages = {};
        for (k in msgs) {
          if (!__hasProp.call(msgs, k)) continue;
          msg = msgs[k];
          m = new Message(_this.client);
          m._setMsg(msg);
          messages[k] = m;
        }
        return cb(err, messages);
      });
    };

    return MessageSet;

  })(EventEmitter);

  Message = (function(_super) {

    __extends(Message, _super);

    function Message(client, uid) {
      this.client = client;
      if (uid != null) this.uid = uid;
    }

    Message.prototype._setMsg = function(msg) {
      var _ref;
      return this.uid = msg.uid, this.flags = msg.flags, this.internaldate = msg.internaldate, (_ref = msg.envelope, this.date = _ref.date, this.subject = _ref.subject, this.from = _ref.from, this.sender = _ref.sender, this['reply-to'] = _ref['reply-to'], this.to = _ref.to, this.cc = _ref.cc, this.bcc = _ref.bcc, this['in-reply-to'] = _ref['in-reply-to'], this['message-id'] = _ref['message-id']), msg;
    };

    Message.prototype.load = function(cb) {
      var _this = this;
      if (!(this.uid != null)) {
        return cb(new Error("Cannot load message data with no UID"));
      }
      return this.client.fetch(this.uid, 'ENVELOPE FLAGS INTERNALDATE UID', true, function(err, msgs) {
        if (msgs[_this.uid] != null) _this._setMsg(msgs[_this.uid]);
        return cb(err);
      });
    };

    Message.prototype.structure = function(cb) {
      var _this = this;
      if (!(this.uid != null)) {
        return cb(new Error("Cannot load message structure with no UID"));
      }
      return this.client.fetch(this.uid, 'BODYSTRUCTURE', true, function(err, msgs) {
        var id, msg;
        for (id in msgs) {
          if (!__hasProp.call(msgs, id)) continue;
          msg = msgs[id];
          if (msg.uid === _this.uid) _this.structure = msg.bodystructure;
        }
        if (_this.structure == null) _this.structure = {};
        _this.sections = _this._processSections(_this.structure) || {};
        return cb(err);
      });
    };

    Message.prototype._processSections = function(structure) {
      var body, data, i, j, result, _len, _ref;
      if (Array.isArray(structure.body)) {
        result = {};
        _ref = structure.body;
        for (data = 0, _len = _ref.length; data < _len; data++) {
          i = _ref[data];
          data = this._processSections(data);
          if (data['']) {
            result[i] = data[''];
          } else {
            for (j in data) {
              body = data[j];
              result["" + i + "." + j] = body;
            }
          }
        }
        return result;
      } else {
        return {
          '': structure
        };
      }
    };

    Message.prototype._getSection = function(it, cb) {
      var handler,
        _this = this;
      handler = function(err) {
        var data, s;
        return cb(err, (function() {
          var _ref, _results;
          _ref = this.sections;
          _results = [];
          for (s in _ref) {
            data = _ref[s];
            if (it(data)) _results.push(s);
          }
          return _results;
        }).call(_this));
      };
      if (!this.sections) {
        return this.structure(handler);
      } else {
        return handler();
      }
    };

    Message.prototype.body = function(fulltype, cb) {
      var _this = this;
      if (!(this.uid != null)) {
        return cb(new Error("Cannot load a message with no UID"));
      }
      return this._getSection(function(data) {
        var subtype, type, _ref;
        _ref = data.body, type = _ref.type, subtype = _ref.subtype;
        return fulltype === ("" + type + "/" + subtype);
      }, function(err, sections) {
        if (!sections.length) return cb(new Error("Body type not found"));
        return _this._loadBody(sections[0], cb);
      });
    };

    Message.prototype._loadBody = function(section, cb) {
      var crit,
        _this = this;
      crit = 'BODY';
      if (section || section === '') crit += "[" + section + "]";
      return this.client.fetch(this.uid, crit, true, function(err, msgs) {
        var id, msg;
        crit = crit.toLowerCase();
        for (id in msgs) {
          if (!__hasProp.call(msgs, id)) continue;
          msg = msgs[id];
          if (msg.uid === _this.uid) return cb(err, msg[crit].value);
        }
      });
    };

    return Message;

  })(EventEmitter);

}).call(this);
