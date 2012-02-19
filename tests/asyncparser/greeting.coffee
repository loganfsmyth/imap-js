


tests =
  "* OK word\n":
    'type': 'OK'
    'text-code': null
    'text': 'word'
  "* PREAUTH word\n":
    'type': 'PREAUTH'
    'text-code': null
    'text': 'word'
  "* BYE word\n":
    'type': 'BYE'
    'text-code': null
    'text': 'word'
  "a OK word\n": null
  "* O2 word\n": null
  "*OK word\n": null
  "*OKword\n": null
  "* OKword\n": null
  "* OK [ALERT] word\n":
    'type': 'OK'
    'text-code':
      'key': 'ALERT'
      'value': null
    'text': 'word'
  "* OK [ ALERT] word\n": null
  "* OK [ALERT ] word\n": null
  "* OK [BADCHARSET] word\n":
    'type': 'OK'
    'text-code':
      'key': 'BADCHARSET'
      'value': []
    'text': 'word'
  "* OK [BADCHARSET (\"word\")] word\n":
    'type': 'OK'
    'text-code':
      'key': 'BADCHARSET'
      'value': [ 'word' ]
    'text': 'word'
  "* OK [BADCHARSET (\"word\" \"word2\")] word\n":
    'type': 'OK'
    'text-code':
      'key': 'BADCHARSET'
      'value': [ 'word', 'word2' ]
    'text': 'word'
  "* OK [BADCHARSET ()] word\n": null
  "* OK [BADCHARSET \"word\"] word\n": null
  "* OK [BADCHARSET (\"word)] word\n": null
  "* OK [CAPABILITY IMAP4rev1] word\n":
    'type': 'OK'
    'text-code':
      'key': 'CAPABILITY'
      'value': [ 'IMAP4rev1' ]
    'text': 'word'
  "* OK [CAPABILITY IMAP4rev1 word2] word\n":
    'type': 'OK'
    'text-code':
      'key': 'CAPABILITY'
      'value': [ 'IMAP4rev1', 'word2' ]
    'text': 'word'
  "* OK [CAPABILITY] word\n": null
  "* OK [CAPABILITY ] word\n": null
  "* OK [PARSE] word\n":
    'type': 'OK'
    'text-code':
      'key': 'PARSE'
      'value': null
    'text': 'word'
  "* OK [PERMANENTFLAGS ()] word\n":
    'type': 'OK'
    'text-code':
      'key': 'PERMANENTFLAGS'
      'value': []
    'text': 'word'
  "* OK [PERMANENTFLAGS (\\Unseen \\Unread)] word\n":
    'type': 'OK'
    'text-code':
      'key': 'PERMANENTFLAGS'
      'value': [ '\\Unseen', '\\Unread' ]
    'text': 'word'
  "* OK [PERMANENTFLAGS] word\n": null
  "* OK [READ-ONLY] word\n":
    'type': 'OK'
    'text-code':
      'key': 'READ-ONLY'
      'value': null
    'text': 'word'
  "* OK [READ-WRITE] word\n":
    'type': 'OK'
    'text-code':
      'key': 'READ-WRITE'
      'value': null
    'text': 'word'
  "* OK [TRYCREATE] word\n":
    'type': 'OK'
    'text-code':
      'key': 'TRYCREATE'
      'value': null
    'text': 'word'
  "* OK [UIDNEXT 10] word\n":
    'type': 'OK'
    'text-code':
      'key': 'UIDNEXT'
      'value': 10
    'text': 'word'
  "* OK [UIDNEXT 0] word\n": null
  "* OK [UIDNEXT] word\n": null
  "* OK [UIDNEXT ] word\n": null
  "* OK [UIDVALIDITY 10] word\n":
    'type': 'OK'
    'text-code':
      'key': 'UIDVALIDITY'
      'value': 10
    'text': 'word'
  "* OK [UNSEEN 10] word\n":
    'type': 'OK'
    'text-code':
      'key': 'UNSEEN'
      'value': 10
    'text': 'word'
  "* OK [atom word] word\n":
    'type': 'OK'
    'text-code':
      'key': 'atom'
      'value': 'word'
    'text': 'word'
  "* OK [atom ] word\n": null
  "* OK [atom \n] word\n": null
  "* OK [atom] word\n":
    'type': 'OK'
    'text-code':
      'key': 'atom'
      'value': null
     'text': 'word'

module.exports = require('./helper').genTests('greeting', tests)

