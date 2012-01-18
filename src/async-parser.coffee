

Stream = require 'stream'

exports.TYPE_CLIENT = CLIENT = 0x01
exports.TYPE_SERVER = SERVER = 0x02

exports.Parser = class Parser extends Stream
  constructor: (@type) ->
    @writable = true
    @destroyed = false
    @writing = false

    @greeting()

  greeting: () ->
    greet = greeting()
    @parser = (data) =>
      result = greet data
      return if not result

      console.log 'Greeting:'
      console.log result.type
      console.log result.text

      @emit 'greeting', result
#      @response()
      return

  response: () ->
    resp = response()
    @parser = (data) =>
      result = resp data
      return if not result

      console.log 'Response:'
      console.log result
      @emit 'response', result
      @response()
      return

  write: (buffer, encoding) ->
    buffer = new Buffer buffer, encoding if not Buffer.isBuffer buffer
    @writing = true

    data =
      buf: buffer
      pos: 0

    while not @destroyed and data.pos < buffer.length
      try
        @parser data
      catch e
        throw e if not e instanceof SyntaxError
        console.log e.toString()
        #@emit 'error', e
        @destroy()

    @writing = false

    if not @destroyed and not @writable
      @destroySoon()

    return true

  end: (str, encoding) ->
    return if not @writable

    @write str, encoding if str
    @destroySoon()
    return

  destroySoon: ->
    @writable = false
    @destroy() if not @writing
    return

  destroy: ->
    if not @destroyed
      @writable = false
      @destroyed = true
      @emit 'close'
    return


class SyntaxError extends Error
  constructor: (data, rule = '', extra = '') ->
    context = 10
    @name = "IMAPSyntaxError"
    {pos, buf} = data

    start = Math.max pos - context, 0
    end = Math.min pos + context, buf.length

    error = pos - start

    @message = rule + (extra and "\n" + extra) + "\n==" + buf.toString('ascii', start, end) + "==\n  " +
      (" " for i in [0...pos]).join('') + "^\n"

greeting = ->

  parts = [
    str('* '),
    oneof(['OK', 'PREAUTH', 'BYE']),
    str(' '),
    resp_text(),
    crlf()
  ]

  zip [null, 'type', null, 'text'], parse parts

resp_text = ->

  n = text()
  y = parse [ bracket_wrap(resp_text_code), str(' '), n ]
  y = zip ['text-code', null, 'text'], y
  n = zip ['text'], n

  starts_with '[', y, n

resp_text_code = ->
  cb = route
    'ALERT': null
#    'BADCHARSET': process(char(' '), paren_list(astring)),
#    'CAPABILITY': capability_data(),
    'PARSE': null,
#    'PERMANENTFLAGS': process(char(' '), paren_list(flag_perm)),
    'READ-ONLY': null,
    'READ-WRITE': null,
    'TRYCREATE': null,
#    'UIDNEXT': nz_number(),
#    'UIDVALIDITY': nz_number(),
#    'UNSEEN': nz_number(),
#    '': 

  zip ['key', 'value'], cb

crlf = ->
  cb = parse [
    opt("\r"),
    str("\n")
  ]

  (data) ->
    result = cb data
    if typeof result != 'undefined'
      return result.join('')

text = ->
  cr = "\r".charCodeAt 0
  lf = "\n".charCodeAt 0
  bufs = []
  length = 0
  (data) ->
    for c, i in data.buf[data.pos...]
      if c in [cr, lf]
        tmp = data.buf[data.pos...data.pos + i]
        data.pos += i
        bufs.push tmp
        length += tmp.length

        all = new Buffer length
        pos = 0
        for b in bufs
          b.copy all, pos
          pos += b.length
        bufs = null
        return all.toString()

    b = data.buf[data.pos...]
    bufs.push b
    length += b.length
    data.pos = data.buf.length
    return

bracket_wrap = (cb) ->
  wrap = parse [
    str('['),
    cb(),
    str(']')
  ]
  
  (data) ->
    result = wrap data
    result[1] if typeof result != 'undefined'

l = (data) ->
  console.log data.buf[data.pos...]
  console.log data.buf.toString('utf8', data.pos)


####################### Parser Helpers  ################

# Use one parser if the buffer starts with one char, and another if not
starts_with = (c, y, n) ->
  start = true
  found = null
  (data) ->
    if start
      start = false
      found = data.buf[data.pos] == c.charCodeAt 0

    if found
      y data
    else
      n data

# Match a given string
str = (s) ->
  buffer = new Buffer s
  i = 0
  (data) ->
    {pos, buf} = data
    while pos < buf.length and i < buffer.length
      err data, 'str', 'failed to match ' + s if buf[pos] != buffer[i]
      i += 1
      pos += 1
    data.pos = pos

    if i == buffer.length
      return s

opt = (c) ->
  (data) ->
    if data.buf[data.pos] == c.charCodeAt 0
      data.pos += 1
      return c
    else
      return ''

err = (data, rule, extra) ->
  throw new SyntaxError data, rule, extra

oneof = (strs) ->
  matches = strs
  i = 0
  (data) ->
    for code in data.buf[data.pos...]
      matches = (str for str in matches when str[i].charCodeAt(0) == code)
      i += 1
      data.pos += 1
      if not matches.length or matches.length == 1 and matches[0].length == i
        break
    console.log matches

    if matches.length == 1 and matches[0].length == i
      return matches[0]
    else if matches.length == 0
      err data, 'oneof', 'No matches in ' + strs.join(',')


route = (routes) ->
  key_cb = oneof (k for own k,v of routes)
  key = null

  (data) ->
    if not key
      result = key_cb data
      key = result if typeof result != 'undefined'
    else if routes[key]
      result = routes[key] data
      if typeof result != 'undefined'
        return [key, result]
    else
      return [ key, null ]
    return

# Given an array of match functions, parse until all are complete and return
# array containing the results
parse = (parts) ->
  ret = []
  (data) ->
    result = parts[0] data
    return if typeof result == 'undefined'

    ret.push result
    parts.shift()

    ret if not parts.length

# Zip an array of keys and a callback that returns an array
zip = (keys, cb) ->

  (data) ->
    result = cb data
    return if typeof result == 'undefined'

    ret = {}
    for k, i in keys when k
      ret[k] = result[i]
    return ret
