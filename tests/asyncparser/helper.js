(function() {
  var parser, testCase,
    __hasProp = Object.prototype.hasOwnProperty;

  testCase = require('nodeunit').testCase;

  parser = require('../../lib/async-parser');

  exports.genTests = function(type, tests) {
    var cases, expected, p, pwrite, str, swrite, _fn;
    p = null;
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
    cases = {
      setUp: function(cb) {
        p = parser.createParser(parser.TYPE_CLIENT);
        return cb();
      }
    };
    console.log(tests);
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
            p.on(type, function(resp) {
              test.deepEqual(resp, expected, 'resp matches expected value.');
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
            p.on(type, function(greeting) {
              test.ok(false, 'resp unexpectedly successfully parsed.');
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
      if (type !== 'greeting') str = '* OK greetings\n' + str;
      _fn(str, expected);
    }
    console.log(cases);
    return module.exports = testCase(cases);
  };

}).call(this);
