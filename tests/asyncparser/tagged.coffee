

tests =
  "a OK word\n":
    'tag': new Buffer 'a'
    'type': 'OK'
    'text-code': null
    'text': new Buffer 'word'
  ") OK word\n": null
  "a NO word\n":
    'tag': new Buffer 'a'
    'type': 'NO'
    'text-code': null
    'text': new Buffer 'word'
  "a BAD word\n":
    'tag': new Buffer 'a'
    'type': 'BAD'
    'text-code': null
    'text': new Buffer 'word'
  "a NOPE word\n": null







module.exports = require('./helper').genTests('tagged', tests)


