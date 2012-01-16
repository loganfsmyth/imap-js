
tokenizer = require 'imap-tokenizer'
async = require 'async'

{Tokenizer} = tokenizer

{STRING_CHAR, TOKEN_START, TOKEN_END} = tokenizer

exports.TYPE_CLIENT = 0x01
exports.TYPE_SERVER = 0x02

exports.TokenParser = class TokenParser extends Tokenizer
  constructor: (@type) ->
    super()
    greeted = false

    callback = greeting()

    @on 'token', (token) =>
      callback.call @, token



greeting = ->

  parts = [
    char('*'),
    char(' '),
    keyword('OK', 'PREAUTH', 'BYE'),
    char(' '),
    rest_text(),
    crlf()
  ]

  cb = process parts

  (token) ->
    result = cb token

    if result
      type: result[2],
      text: result[4]


rest_text = ->
  text_code = null
  (token) ->
    if text_code == null
      token.data





# Given a list of callbacks, progress through them one at a time until all are
# completed.
process = (callbacks) ->
  i = 0
  results = []
  (token) ->
    result = callbacks[i](token)
    if typeof result != 'undefined'
      results[i] = result
      i += 1

    if i >= callbacks.length
      return results

# Returns a function that matches a single character
char = (c) ->
  aggregate STRING_CHAR, (token) ->
    if token.data == c
      c
    else
      # ERROR
      false

# Returns a function that matches on a set of keywords, and returns the given
# keyword when found, or false if there is no match.
keyword = (keywords...) ->
  max = 0
  for kw in keywords
    max = kw.length if kw.length > max

  aggregate STRING_ATOM, max, (token) ->
    str = token.data.toString()
    if str in kw
      str
    else
      # ERROR
      return false

# Returns a function that will collect tokens until both start and end are
# found, and then will trigger the given callback. If the tokens are of th wrong
# type of the too long, and error occurs.
aggregate = (args..., cb) ->
  expected_type = args[0]
  max_length = args[1]

  type = null
  buffers = null
  length = 0
  (token) ->
    if token.type | TOKEN_START
      if expected_type and not token.type | expected_type
        # ERROR
        return
      if token.type | TOKEN_END
        return cb token
      else
        type = token.type
        buffers = [ token.data ]
        length += token.data
        if max_length and length > max_length
          # ERROR
          return
    else if buffers and token.type | TOKEN_END
      data = new Buffer length
      pos = 0
      for buffer in buffers
        buffer.copy data, pos
        pos += buffer.length
      return cb
        type: type,
        data: data

    else if buffers and token.type | type
      buffers.push token.data
    else
      # ERROR
      return
    return



