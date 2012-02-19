(function() {
  var tests;

  tests = {
    "+ OK word\n": {
      'text-code': null,
      'text': 'OK word'
    },
    "+ [ALERT] word\n": {
      'text-code': {
        'key': 'ALERT',
        'value': null
      },
      'text': 'word'
    }
  };

  module.exports = require('./helper').genTests('continuation', tests);

}).call(this);
