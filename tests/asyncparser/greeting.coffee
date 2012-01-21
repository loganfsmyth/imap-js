
{testCase} = require 'nodeunit'
parser = require '../../lib/async-parser'


tests =
  "* BYE word\n":
    'type': 'BYE'
    'text':
      'text': new Buffer 'word'
  "* OK word\n":
    'type': 'OK'
    'text':
      'text': new Buffer 'word'
  "* PREAUTH word\n":
    'type': 'PREAUTH'
    'text':
      'text': new Buffer 'word'
  "* OK [ALERT] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'ALERT'
        'value': null
      'text': new Buffer 'word'
  "* OK [BADCHARSET] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'BADCHARSET'
        'value': []
      'text': new Buffer 'word'
  "* OK [BADCHARSET (\"word\")] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'BADCHARSET'
        'value': [ new Buffer 'word' ]
      'text': new Buffer 'word'
  "* OK [BADCHARSET (\"word\" \"word2\")] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'BADCHARSET'
        'value': [ new Buffer('word'), new Buffer('word2') ]
      'text': new Buffer 'word'
  "* OK [CAPABILITY IMAP4rev1] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'CAPABILITY'
        'value': [ new Buffer('IMAP4rev1') ]
      'text': new Buffer 'word'
  "* OK [CAPABILITY IMAP4rev1 word2] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'CAPABILITY'
        'value': [ new Buffer('IMAP4rev1'), new Buffer('word2') ]
      'text': new Buffer 'word'
  "* OK [PARSE] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'PARSE'
        'value': null
      'text': new Buffer 'word'
  "* OK [PERMANENTFLAGS ()] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'PERMANENTFLAGS'
        'value': []
      'text': new Buffer 'word'
  "* OK [PERMANENTFLAGS (\\Unseen \\Unread)] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'PERMANENTFLAGS'
        'value': [ new Buffer('\\Unseen'), new Buffer('\\Unread') ]
      'text': new Buffer 'word'
  "* OK [READ-ONLY] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'READ-ONLY'
        'value': null
      'text': new Buffer 'word'
  "* OK [READ-WRITE] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'READ-WRITE'
        'value': null
      'text': new Buffer 'word'
  "* OK [TRYCREATE] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'TRYCREATE'
        'value': null
      'text': new Buffer 'word'
  "* OK [UIDNEXT 10] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'UIDNEXT'
        'value': 10
      'text': new Buffer 'word'
  "* OK [UIDVALIDITY 10] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'UIDVALIDITY'
        'value': 10
      'text': new Buffer 'word'
  "* OK [UNSEEN 10] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': 'UNSEEN'
        'value': 10
      'text': new Buffer 'word'
  "* OK [atom word] word\n":
    'type': 'OK'
    'text':
      'text-code':
        'key': new Buffer 'atom'
        'value': new Buffer 'word'
      'text': new Buffer 'word'


swrite = (b) ->
  for i in [0...b.length]
    p.write b[i...i+1]
  p.end()

pwrite = (b) ->
  p.write b
  p.end()

p = null

cases =
  setUp: (cb) ->
    p = parser.createParser parser.TYPE_CLIENT
    cb()

for own str, expected of tests
  do (str, expected) ->
    for own suf, wrt of {'split':swrite, 'single': pwrite}
      name = str.replace /[\r\n]/, '_'
      cases[name + '_' + suf] = (test) ->
        p.on 'greeting', (greeting) ->
          test.deepEqual greeting, expected, 'Response matches expected value.'
          test.done()
        p.on 'error', (err) ->
          test.ok false, err.toString()
          test.done()
        wrt new Buffer str


console.log cases

module.exports = testCase cases

