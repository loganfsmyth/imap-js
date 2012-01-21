(function() {
  var cases, expected, p, parser, pwrite, str, swrite, testCase, tests, _fn,
    __hasProp = Object.prototype.hasOwnProperty;

  testCase = require('nodeunit').testCase;

  parser = require('../../lib/async-parser');

  tests = {
    "* OK word\n": {
      'type': 'OK',
      'text-code': null,
      'text': new Buffer('word')
    },
    "* PREAUTH word\n": {
      'type': 'PREAUTH',
      'text-code': null,
      'text': new Buffer('word')
    },
    "* BYE word\n": {
      'type': 'BYE',
      'text-code': null,
      'text': new Buffer('word')
    },
    "a OK word\n": null,
    "* O2 word\n": null,
    "*OK word\n": null,
    "*OKword\n": null,
    "* OKword\n": null,
    "* OK [ALERT] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'ALERT',
        'value': null
      },
      'text': new Buffer('word')
    },
    "* OK [ ALERT] word\n": null,
    "* OK [ALERT ] word\n": null,
    "* OK [BADCHARSET] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'BADCHARSET',
        'value': []
      },
      'text': new Buffer('word')
    },
    "* OK [BADCHARSET (\"word\")] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'BADCHARSET',
        'value': [new Buffer('word')]
      },
      'text': new Buffer('word')
    },
    "* OK [BADCHARSET (\"word\" \"word2\")] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'BADCHARSET',
        'value': [new Buffer('word'), new Buffer('word2')]
      },
      'text': new Buffer('word')
    },
    "* OK [BADCHARSET ()] word\n": null,
    "* OK [BADCHARSET \"word\"] word\n": null,
    "* OK [BADCHARSET (\"word)] word\n": null,
    "* OK [CAPABILITY IMAP4rev1] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'CAPABILITY',
        'value': [new Buffer('IMAP4rev1')]
      },
      'text': new Buffer('word')
    },
    "* OK [CAPABILITY IMAP4rev1 word2] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'CAPABILITY',
        'value': [new Buffer('IMAP4rev1'), new Buffer('word2')]
      },
      'text': new Buffer('word')
    },
    "* OK [CAPABILITY] word\n": null,
    "* OK [CAPABILITY ] word\n": null,
    "* OK [PARSE] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'PARSE',
        'value': null
      },
      'text': new Buffer('word')
    },
    "* OK [PERMANENTFLAGS ()] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'PERMANENTFLAGS',
        'value': []
      },
      'text': new Buffer('word')
    },
    "* OK [PERMANENTFLAGS (\\Unseen \\Unread)] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'PERMANENTFLAGS',
        'value': [new Buffer('\\Unseen'), new Buffer('\\Unread')]
      },
      'text': new Buffer('word')
    },
    "* OK [PERMANENTFLAGS] word\n": null,
    "* OK [READ-ONLY] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'READ-ONLY',
        'value': null
      },
      'text': new Buffer('word')
    },
    "* OK [READ-WRITE] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'READ-WRITE',
        'value': null
      },
      'text': new Buffer('word')
    },
    "* OK [TRYCREATE] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'TRYCREATE',
        'value': null
      },
      'text': new Buffer('word')
    },
    "* OK [UIDNEXT 10] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'UIDNEXT',
        'value': 10
      },
      'text': new Buffer('word')
    },
    "* OK [UIDNEXT 0] word\n": null,
    "* OK [UIDNEXT] word\n": null,
    "* OK [UIDNEXT ] word\n": null,
    "* OK [UIDVALIDITY 10] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'UIDVALIDITY',
        'value': 10
      },
      'text': new Buffer('word')
    },
    "* OK [UNSEEN 10] word\n": {
      'type': 'OK',
      'text-code': {
        'key': 'UNSEEN',
        'value': 10
      },
      'text': new Buffer('word')
    },
    "* OK [atom word] word\n": {
      'type': 'OK',
      'text-code': {
        'key': new Buffer('atom'),
        'value': new Buffer('word')
      },
      'text': new Buffer('word')
    },
    "* OK [atom ] word\n": null,
    "* OK [atom \n] word\n": null,
    "* OK [atom] word\n": {
      'type': 'OK',
      'text-code': {
        'key': new Buffer('atom'),
        'value': null
      },
      'text': new Buffer('word')
    }
  };

  swrite = function(b) {
    var i, _ref;
    for (i = 0, _ref = b.length; 0 <= _ref ? i < _ref : i > _ref; 0 <= _ref ? i++ : i--) {
      p.write(b.slice(i, (i + 1)));
    }
    return p.end();
  };

  pwrite = function(b) {
    p.write(b);
    return p.end();
  };

  p = null;

  cases = {
    setUp: function(cb) {
      p = parser.createParser(parser.TYPE_CLIENT);
      return cb();
    }
  };

  _fn = function(str, expected) {
    var name, suf, wrt, _ref, _results;
    _ref = {
      'split': swrite,
      'single': pwrite
    };
    _results = [];
    for (suf in _ref) {
      if (!__hasProp.call(_ref, suf)) continue;
      wrt = _ref[suf];
      name = str.replace(/[\r\n]/g, '_');
      if (expected) {
        _results.push(cases[name + '_' + suf] = function(test) {
          p.on('greeting', function(greeting) {
            test.deepEqual(greeting, expected, 'Response matches expected value.');
            return test.done();
          });
          p.on('error', function(err) {
            test.ok(false, err.toString());
            return test.done();
          });
          return wrt(new Buffer(str));
        });
      } else {
        _results.push(cases[name + '_' + suf] = function(test) {
          p.on('greeting', function(greeting) {
            test.ok(false, 'greeting unexpectedly successfully parsed.');
            return test.done();
          });
          p.on('error', function(err) {
            test.ok(err instanceof parser.SyntaxError, 'Test threw an error while parsing.');
            return test.done();
          });
          return wrt(new Buffer(str));
        });
      }
    }
    return _results;
  };
  for (str in tests) {
    if (!__hasProp.call(tests, str)) continue;
    expected = tests[str];
    _fn(str, expected);
  }

  console.log(cases);

  module.exports = testCase(cases);

}).call(this);
