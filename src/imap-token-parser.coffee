
tokenizer = require 'imap-tokenizer'
async = require 'async'

{Tokenizer} = tokenizer

{STRING_QUOTED, STRING_CHAR, CRLF, TOKEN_START, TOKEN_END} = tokenizer

exports.STRING_TEXT = STRING_TEXT = 0x00001000

exports.TYPE_CLIENT = 0x01
exports.TYPE_SERVER = 0x02

exports.TokenParser = class TokenParser extends Tokenizer
  constructor: (@type) ->
    super()
    greeted = false

    callback = greeting()

    @on 'token', (token) =>
      repeat = false
      token.push = ->
        repeat = true
      while true
        callback.call @, token
        if not repeat
          break





greeting = ->

  parts = [
    char('*'),
    char(' '),
    keyword('OK', 'PREAUTH', 'BYE'),
    char(' '),
    rest_text(),
    crlf()
  ]

  cb = process parts...

  (token) ->
    result = cb token

    if result
      type: result[2],
      text: result[4]


rest_text = ->
  parts = [
    char('['),
    resp_text_code(),
    char(']'),
    char(' '),
    aggregateUntil(CRLF, crlf())
  ]

  cb = null

  (token) ->
    if not cb
      if token.data[0] == '['
        cb = process parts...
      else
        cb = process 4, parts...

    return cb token

resp_text_code = ->

  routes = 
    'ALERT': null,
    'BADCHARSET': process(char(' '), paren_list(astring)),
    'CAPABILITY': capability_data(),
    'PARSE': null,
    'PERMANENTFLAGS': process(char(' '), paren_list(flag_perm)),
    'READ-ONLY': null,
    'READ-WRITE': null,
    'TRYCREATE': null,
    'UIDNEXT': nz_number(),
    'UIDVALIDITY': nz_number(),
    'UNSEEN': nz_number(),
    '': 

  cb = route STRING_ATOM, routes

  (token) ->
    result = cb token

flag_perm = ->

capability_data = ->
  process(char(' '), space_list(capability, 


paren_list = (create) ->

  parts = [
    char('('),
    space_list(create, char(')'))
  ]
  
  cb = process parts...
  (token) ->
    result = cb token
    if typeof result != 'undefined'
      return results[1][0]


space_list = (create, callback) ->

  results = []

  cb = create()
  done = false

  (token) ->
    if not cb
      if not done and token.data[0] == ' '
        cb = create()
      else
        done = true

      if done
        result = callback token
        if typeof results != 'undefined'
          return [results, result]

    else
      result = cb token
      if typeof result != 'undefined'
        results.push result
        cb = null



################ async token helper functions ###############

route = (type, routes) ->

  key_cb = aggregate type, (token) ->
    return token.data.toString()

  key = null

  (token) ->
    if not key
      key = key_cb token
      if typeof key != 'undefined' and results[key] == null
        return [key, null]
    else
      cb = routes[key] if routes[key] else routes['']
      result = cb token
      if typeof result != 'undefined'
        return [key, result]



# Given a list of callbacks, progress through them one at a time until all are
# completed.
process = (callbacks...) ->
  if typeof callback[0] == 'number'
    i = callbacks.shift()
  else
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
        length += token.data.length
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

aggregateUntil = (until_type, cb) ->
  data = []
  length = 0
  found = false
  type = null

  (token) ->
    if not found and token.type | until_type
      data = new Buffer length
      pos = 0
      for buffer in buffers
        buffer.copy data, pos
        pos += buffer.length
      return cb
        type: exports.STRING_TEXT,
        data: data

    return cb token if found


    if token.type | TOKEN_START and not type
      type = token.type
      if type | STRING_QUOTED
        data.push new Buffer '"'
        length += 1
      else if type | STRING_LITERAL_SIZE
        b = new Buffer "{" + token.data + "} \r\n"
        data.push b
        length += b.length
    else
      # ERROR
      return

    data.push token.data
    length += token.data.length

    if token.type | TOKEN_END and token.type | type
      type = null
      if type | STRING_QUOTED
        data.push new Buffer '"'
    else
      # ERROR
      return






