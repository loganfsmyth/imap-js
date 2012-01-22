


tests =
  "+ OK word\n":
    'text-code': null
    'text': new Buffer 'OK word'
  "+ [ALERT] word\n":
    'text-code':
      'key': new Buffer 'ALERT'
      'value': null
    'text': new Buffer 'word'

module.exports = require('./helper').genTests('continuation', tests)


