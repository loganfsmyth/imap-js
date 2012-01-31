(function() {
  var Stream, TestStream, cl, client, cmd, s, testCase,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  testCase = require('nodeunit').testCase;

  Stream = require('stream');

  client = require('../../index');

  cl = null;

  s = null;

  TestStream = (function(_super) {

    __extends(TestStream, _super);

    function TestStream(_arg, test) {
      var resp, write,
        _this = this;
      write = _arg.write, resp = _arg.resp;
      this.test = test;
      process.nextTick(function() {
        _this.emit('connect');
        return _this.emit('data', "* OK Greetings!\r\n");
      });
      this.write = function(buf, enc) {
        var _this = this;
        if (enc) buf = new Buffer(buf, enc);
        this.test.equal(buf.toString('utf8'), write, 'Sent command matches expected value');
        return process.nextTick(function() {
          return _this.emit('data', resp);
        });
      };
    }

    return TestStream;

  })(Stream);

  cmd = function(args) {
    return function(test) {
      s = new TestStream(args, test);
      return cl = client.createClient({
        stream: s
      }, function() {
        return args.command(test);
      });
    };
  };

  module.exports = testCase({
    capability: cmd({
      write: "0 CAPABILITY\r\n",
      resp: "* OK IMAP4rev1 LITERAL+\r\n0 OK CAPABILITY done.\r\n",
      command: function(test) {
        return cl.capability(function(err, caps) {
          test.ok(!err, "No command errors");
          test.deepEqual(caps, ['IMAP4rev1', 'LITERAL+']);
          return test.done();
        });
      }
    }),
    noop: cmd({
      write: "0 NOOP\r\n",
      resp: "0 OK NOOP Completed\r\n",
      command: function(test) {
        return cl.noop(function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    logout: cmd({
      write: "0 LOGOUT\r\n",
      resp: "0 OK LOGOUT done.\r\n",
      command: function(test) {
        return cl.capability(function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    login: cmd({
      write: "0 LOGIN \"user\" \"pass\"\r\n",
      resp: "0 OK LOGIN completed\r\n",
      command: function(test) {
        return cl.login('user', 'pass', function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    select: cmd({
      write: "0 SELECT \"INBOX\"\r\n",
      resp: "* FLAGS (\\Flag \\Flag2)\r\n" + "* 5 EXISTS\r\n" + "* 3 RECENT\r\n" + "* OK [UNSEEN 14] Unseen\r\n" + "* OK [PERMANENTFLAGS (\\* \\Deleted)] Perm\r\n" + "* OK [UIDNEXT 43] Next\r\n" + "* OK [UIDVALIDITY 7654] Valid\r\n" + "0 OK Select Complete\r\n",
      command: function(test) {
        return cl.select('INBOX', function(err, _arg) {
          var exists, flags, permflags, recent, uidnext, uidvalidity, unseen;
          flags = _arg.flags, exists = _arg.exists, recent = _arg.recent, unseen = _arg.unseen, permflags = _arg.permflags, uidnext = _arg.uidnext, uidvalidity = _arg.uidvalidity;
          test.ok(!err, "No command errors");
          test.deepEqual(flags, ['\\Flag', '\\Flag2']);
          test.equal(exists, 5);
          test.equal(recent, 3);
          test.equal(unseen, 14);
          test.deepEqual(permflags, ['\\*', '\\Deleted']);
          test.equal(uidnext, 43);
          test.equal(uidvalidity, 7654);
          return test.done();
        });
      }
    }),
    examine: cmd({
      write: "0 EXAMINE \"INBOX\"\r\n",
      resp: "* FLAGS (\\Flag \\Flag2)\r\n" + "* 5 EXISTS\r\n" + "* 3 RECENT\r\n" + "* OK [UNSEEN 14] Unseen\r\n" + "* OK [PERMANENTFLAGS (\\* \\Deleted)] Perm\r\n" + "* OK [UIDNEXT 43] Next\r\n" + "* OK [UIDVALIDITY 7654] Valid\r\n" + "0 OK Examine Complete\r\n",
      command: function(test) {
        return cl.examine('INBOX', function(err, _arg) {
          var exists, flags, permflags, recent, uidnext, uidvalidity, unseen;
          flags = _arg.flags, exists = _arg.exists, recent = _arg.recent, unseen = _arg.unseen, permflags = _arg.permflags, uidnext = _arg.uidnext, uidvalidity = _arg.uidvalidity;
          test.ok(!err, "No command errors");
          test.deepEqual(flags, ['\\Flag', '\\Flag2']);
          test.equal(exists, 5);
          test.equal(recent, 3);
          test.equal(unseen, 14);
          test.deepEqual(permflags, ['\\*', '\\Deleted']);
          test.equal(uidnext, 43);
          test.equal(uidvalidity, 7654);
          return test.done();
        });
      }
    }),
    create: cmd({
      write: "0 CREATE \"INBOX\"\r\n",
      resp: "0 OK Create done.\r\n",
      command: function(test) {
        return cl.create('INBOX', function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    "delete": cmd({
      write: "0 DELETE \"INBOX\"\r\n",
      resp: "0 OK done.\r\n",
      command: function(test) {
        return cl["delete"]('INBOX', function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    rename: cmd({
      write: "0 RENAME \"INBOX2\" \"INBOX3\"\r\n",
      resp: "0 OK done.\r\n",
      command: function(test) {
        return cl.rename('INBOX2', 'INBOX3', function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    subscribe: cmd({
      write: "0 SUBSCRIBE \"INBOX\"\r\n",
      resp: "0 OK done.\r\n",
      command: function(test) {
        return cl.subscribe('INBOX', function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    unsubscribe: cmd({
      write: "0 UNSUBSCRIBE \"INBOX\"\r\n",
      resp: "0 OK done.\r\n",
      command: function(test) {
        return cl.unsubscribe('INBOX', function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    list: cmd({
      write: "0 LIST \"\" \"INBOX\"",
      resp: "* LIST (\\Noinferiors) \"/\" \"INBOX\"\r\n" + "* LIST (\\Noinferiors \\Unmarked) \"/\" \"INBOX/subdir\"\r\n"
    }, "* LIST (\\Noinferiors \\Unmarked) \"/\" \"INBOX/subdir2\"\r\n", "* LIST (\\Noinferiors \\Unmarked) \"/\" \"INBOX2\"\r\n" + "0 OK done.\r\n", {
      command: function(test) {
        return cl.list('', 'INBOX', function(err, boxes, sep) {
          test.ok(!err, "No command errors");
          test.deepEqual(boxes, [
            {
              'INBOX': ['\\Noinferiors'],
              'INBOX/subdir': ['\\Noinferiors', '\\Unmarked'],
              'INBOX/subdir2': ['\\Noinferiors', '\\Unmarked'],
              'INBOX2': ['\\Noinferiors', '\\Unmarked']
            }
          ]);
          test.equal(sep, '/');
          return test.done();
        });
      }
    }),
    lsub: cmd({
      write: "0 LSUB \"\" \"INBOX\"",
      resp: "* LSUB (\\Noinferiors) \"/\" \"INBOX\"\r\n" + "* LSUB (\\Noinferiors \\Unmarked) \"/\" \"INBOX/subdir\"\r\n"
    }, "* LSUB (\\Noinferiors \\Unmarked) \"/\" \"INBOX/subdir2\"\r\n", "* LSUB (\\Noinferiors \\Unmarked) \"/\" \"INBOX2\"\r\n" + "0 OK done.\r\n", {
      command: function(test) {
        return cl.list('', 'INBOX', function(err, boxes, sep) {
          test.ok(!err, "No command errors");
          test.deepEqual(boxes, [
            {
              'INBOX': ['\\Noinferiors'],
              'INBOX/subdir': ['\\Noinferiors', '\\Unmarked'],
              'INBOX/subdir2': ['\\Noinferiors', '\\Unmarked'],
              'INBOX2': ['\\Noinferiors', '\\Unmarked']
            }
          ]);
          test.equal(sep, '/');
          return test.done();
        });
      }
    }),
    status: cmd({
      write: "0 STATUS \"INBOX\" (UIDNEXT MESSAGES)",
      resp: "* STATUS \"INBOX\" (MESSAGES 23 UIDNEXT 543)\r\n" + "0 OK done.\r\n",
      command: function(test) {
        return cl.status('INBOX', ['UIDNEXT', 'MESSAGES'], function(err, stat) {
          test.ok(!err, "No command errors");
          test.deepEqual(stat, {
            uidnext: 543,
            messages: 23
          });
          return test.done();
        });
      }
    }),
    check: cmd({
      write: "0 CHECK\r\n",
      resp: "0 OK Done.\r\n",
      command: function(test) {
        return cl.check(function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    close: cmd({
      write: "0 CLOSE\r\n",
      resp: "0 OK Done.\r\n",
      command: function(test) {
        return cl.close(function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    expunge: cmd({
      write: "0 EXPUNGE\r\n",
      resp: "* 3 EXPUNGE\r\n" + "* 3 EXPUNGE\r\n" + "* 5 EXPUNGE\r\n" + "* 8 EXPUNGE\r\n" + "0 OK Done.\r\n",
      command: function(test) {
        return cl.expunge(function(err, ids) {
          test.ok(!err, "No command errors");
          test.deepEqual(ids, [3, 4, 7, 11]);
          return test.done();
        });
      }
    }),
    search: cmd({
      write: "0 SEARCH FLAGGED\r\n",
      resp: "* SEARCH 2 84 882\r\n" + "0 OK Done.\r\n",
      command: function(test) {
        var crit;
        crit = 'FLAGGED';
        return cl.search('UTF8', crit, function(err, ids) {
          test.ok(!err, "No command errors");
          test.deepEqual(ids, [2, 84, 882]);
          return test.done();
        });
      }
    }),
    fetch: cmd({
      write: "0 FETCH 2:4 (ALL)\r\n",
      resp: "\r\n" + "0 OK Done.\r\n",
      command: function(test) {
        var crit;
        crit = 'ALL';
        return cl.fetch(2, 4, crit, function(err, resp) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    }),
    store: cmd({
      write: "0 STORE 2:4 +FLAG (\\Fg)",
      resp: "* 2 FETCH (FLAGS (\\Fg))\r\n" + "* 3 FETCH (FLAGS (\\Fg))\r\n" + "* 4 FETCH (FLAGS (\\Fg))\r\n" + "0 OK Done.\r\n",
      command: function(test) {
        return cl.store(2, 4, 'add', ['\\Fg'], function(err, flags) {
          test.ok(!err, "No command errors");
          test.deepEqual(flags, {
            '2': ['\\Fg'],
            '3': ['\\Fg'],
            '4': ['\\Fg']
          });
          return test.done();
        });
      }
    }),
    copy: cmd({
      write: "0 COPY 2:4 \"INBOX\"\r\n",
      resp: "0 OK Done.\r\n",
      command: function(test) {
        return cl.copy(2, 4, function(err) {
          test.ok(!err, "No command errors");
          return test.done();
        });
      }
    })
  });

}).call(this);
