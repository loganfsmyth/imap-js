
{testCase} = require 'nodeunit'
parser = require '../../lib/async-parser'

exports.genTests = (type, tests) ->

  p = null

  swrite = (b) ->
    for i in [0...b.length]
      p.write b[i...i+1]
    p.end()

  pwrite = (b) ->
    p.write b
    p.end()

  cases =
    setUp: (cb) ->
      p = parser.createParser parser.TYPE_CLIENT
      cb()

  console.log tests

  for own str, expected of tests
    if type != 'greeting'
      str = '* OK greetings\n' + str

    do (str, expected) ->
      for own suf, wrt of {'split': swrite, 'single': pwrite}
        name = str.replace /[\r\n]/g, '_'

        if expected
          cases[name + '_' + suf] = (test) ->
            p.on type, (resp) ->
              test.deepEqual resp, expected, 'resp matches expected value.'
              test.done()
            p.on 'error', (err) ->
              test.ok false, err.toString()
              test.done()
            wrt new Buffer str
        else
          cases[name + '_' + suf] = (test) ->
            p.on type, (greeting) ->
              test.ok false, 'resp unexpectedly successfully parsed.'
              test.done()
            p.on 'error', (err) ->
              test.ok err instanceof parser.SyntaxError, 'Test threw an error while parsing.'
              test.done()
            wrt new Buffer str


  console.log cases

  module.exports = testCase cases


