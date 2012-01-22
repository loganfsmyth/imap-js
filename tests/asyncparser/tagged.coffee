

tests =
  "a OK word\n":
    'tag': new Buffer 'a'
    'type': 'OK'
    'text-code': null
    'text': new Buffer 'word'








module.exports = require('./helper').genTests('tagged', tests)


