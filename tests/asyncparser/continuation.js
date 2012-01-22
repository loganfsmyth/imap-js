(function() {
  var tests;

  tests = {
    "+ OK word\n": {
      'text-code': null,
      'text': new Buffer('OK word')
    }
  };

  module.exports = require('./helper').genTests('continuation', tests);

}).call(this);
