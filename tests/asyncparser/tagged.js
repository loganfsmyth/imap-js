(function() {
  var tests;

  tests = {
    "a OK word\n": {
      'tag': 'a',
      'type': 'OK',
      'text-code': null,
      'text': 'word'
    },
    ") OK word\n": null,
    "a NO word\n": {
      'tag': 'a',
      'type': 'NO',
      'text-code': null,
      'text': 'word'
    },
    "a BAD word\n": {
      'tag': 'a',
      'type': 'BAD',
      'text-code': null,
      'text': 'word'
    },
    "a NOPE word\n": null
  };

  module.exports = require('./helper').genTests('tagged', tests);

}).call(this);
