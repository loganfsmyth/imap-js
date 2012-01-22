(function() {
  var tests;

  tests = {
    "* OK word\n": {
      'type': 'OK',
      'text-code': null,
      'text': new Buffer('word')
    }
  };

  module.exports = require('./helper').genTests('untagged', tests);

}).call(this);
