

Stream = require 'stream'

exports.TYPE_CLIENT = CLIENT = 0x01
exports.TYPE_SERVER = SERVER = 0x02

exports.createParser = (type, cb) ->
  p = new Parser(type)
  p.on 'response', cb if cb
  return p


exports.Parser = class Parser extends Stream
  constructor: (@type) ->
    @writable = true
    @destroyed = false
    @writing = false

    if @type == CLIENT
      @_greeting()
    else if @type == SERVER
      @_command()
    else
      throw Error "Parser type must be client or server."

  _greeting: () ->
    greet = greeting()
    @parser = (data) =>
      result = greet data
      return if not result

      console.log 'Greeting:'
      console.log result.type
      console.log result.text

      @emit 'greeting', result
      @_response()
      return

  _response: () ->
    resp = response()
    @parser = (data) =>
      result = resp data
      return if not result

      console.log 'Response:'
      console.log result
      @emit 'response', result
      @_response()
      return

  write: (buffer, encoding) ->
    buffer = new Buffer buffer, encoding if not Buffer.isBuffer buffer
    @writing = true

    data =
      buf: buffer
      pos: 0

    while not @destroyed and data.pos < buffer.length
      #@parser data
      try
        @parser data
      catch e
        throw e if e not instanceof SyntaxError
        #console.log e.toString()
        @emit 'error', e
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

    @message =
      rule + (extra and "\n" + extra) + "\n" +
      "==" + buf.toString('utf8', start, end) + "==\n" +
      "  " + (" " for i in [0...pos]).join('') + "^\n"

response = ->

greeting = ->
  zip [ null, 'type', null, 'text'], parse [
    str('* '),
    oneof(['OK', 'PREAUTH', 'BYE']),
    str(' '),
    resp_text(),
    crlf()
  ]

resp_text = ->

  n = text()
  y = parse [ bracket_wrap(resp_text_code), str(' '), n ]
  y = zip ['text-code', null, 'text'], y
  n = zip ['text'], parse [ n ]

  starts_with '[', y, n

resp_text_code = ->
  space_num = pick 1, parse [str(' '), nz_number()]
  badcharset = -> pick(1, parse([str(' '), paren_wrap(-> space_list(astring))]))

  zip ['key', 'value'], route {
    'ALERT': null
    'BADCHARSET': lookup({' ': badcharset, '':empty}),
    'CAPABILITY': pick(1, parse([str(' '), capability_data()])),
    'PARSE': null,
    'PERMANENTFLAGS': pick(1, parse([str(' '), paren_wrap(-> space_list(flag_perm, true))])),
    'READ-ONLY': null,
    'READ-WRITE': null,
    'TRYCREATE': null,
    'UIDNEXT': space_num,
    'UIDVALIDITY': space_num,
    'UNSEEN': space_num,
  }, parse([atom(), lookup({' ': atom_args, '': empty  })])

textchar_str = () ->
  col = collector()
  (data) ->
    for code, i in data.buf[data.pos...]
      if code not in text_chars() or code == ']'.charCodeAt 0
        col data.buf[data.pos...data.pos+i]
        data.pos += i
        all = col()

        return all if all

        err data, 'textchar_str', 'textchar_strings must have at least one value'

    col data.buf[data.pos...]
    data.pos = data.length


atom_args = ->
  pick(1, parse([str(' '), textchar_str()]))

flag_perm = ->
  slash_flags = lookup
    '*': -> str('*')
    '': -> atom()

  lookup
    '\\': -> join(parse([str('\\'), slash_flags]))
    '': atom


capability_data = ->
  space_list capability

capability = ->
  atom()

atom = ->
  col = collector()
  (data) ->
    for code, i in data.buf[data.pos...]
      if code not in atom_chars()
        col data.buf[data.pos...data.pos+i]
        data.pos += i
        all = col()
        return all if all
        err data, 'atom', 'atom must contain at least one character'

    col data.buf[data.pos...]
    data.pos = data.length

empty = ->
  (data) -> []

astring = ->
  lookup {
    '{': string,
    '"': string,
    '': astring_str,
  }

lookup = (map) ->
  handler = null
  (data) ->
    if not handler
      c = String.fromCharCode data.buf[data.pos]
      handler = if map[c] then map[c]() else map['']()
    handler data

string = ->
  lookup {
    '{': literal,
    '"': quoted,
    '': (data) ->
      err data, 'string', 'Expected a { or " at the start of the string.'
  }


quoted = ->
  wrap '"', '"', quoted_inner

quoted_inner = ->
  escaped = 0
  col = collector()
  (data) ->
    for code,j in data.buf[data.pos...]
      if escaped%2 == 1 or code == '\\'.charCodeAt 0
        escaped += 1
        continue

      if code == '"'.charCodeAt 0
        col data.buf[data.pos...data.pos+j]
        data.pos += j
        return col()

    col data.buf[data.pos...]
    data.pos = data.length



literal = (emit) ->
  size = literal_size()
  nl = crlf()
  dat = null
  length = 0
  (data) ->
    if size
      result = size data
      return if typeof result == 'undefined'
      length = result
      size = null
      dat = literal_data length, emit

    if nl
      result = nl data
      return if typeof result == 'undefined'
      nl = null

    result = dat data
    return result if typeof result != 'undefined'

literal_size = ->
  curly_wrap number

literal_data = (size, emit) ->
  buffers = [] if not emit
  remaining = size
  (data) ->
    len = Math.min data.buf.length - data.pos, size
    remaining -= len
    buf = data.buf[data.pos...data.pos+len]
    data.pos += len
    for code in buf
      if code not in [0x01..0xFF]
        err data, 'literal_data', 'Literals can only bytes between 1 and 255'

    if not emit
      buffers.push buf
      if remaining == 0
        all = new Buffer size
        pos = 0
        for b in buffers
          b.copy all, pos
          pos += b.length
        return all
    else
      emit buf
      if remailing == 0
        return true

astring_str = ->
  col = collector()
  chars = astring_chars()
  i = 0
  (data) ->
    for code, j in data.buf[data.pos...]
      if code not in chars
        if i == 0
          err data, 'astring_str', 'astring character expected'
        col data.buf[data.pos...data.pos+j]
        data.pos += j
        return col()
      i += 1


    col data.buf[data.pos...]
    data.pos = data.length


collector = ->
  buffers = []
  length = 0
  (b) ->
    if not b
      if length == 0
        return null
      if buffers.length == 1
        all = buffers[0]
      else
        all = new Buffer length
        pos = 0
        for buf in buffers
          buf.copy all, pos
          pos += buf.length
      buffers = []
      return all
    else
      length += b.length
      buffers.push b
    return

list_wildcards = do -> 
  b = new Buffer '%*'
  -> b

quoted_specials = do ->
  b = new Buffer '"\\'
  -> b

resp_specials = do ->
  b = new Buffer ']'
  -> b

ctl = do ->
  chars = [0x00..0x1F]
  chars.push 0x7F
  b = new Buffer chars
  chars = null
  -> b

atom_specials = do ->
  col = collector()
  col new Buffer '(){ '
  col list_wildcards()
  col quoted_specials()
  col resp_specials()
  col ctl()
  b = col()
  col = null
  -> b

atom_chars = do ->
  b = new Buffer (c for c in [0x01..0x7F] when c not in atom_specials())
  -> b

astring_chars = do ->
  ac = atom_chars()
  rs = resp_specials()
  b = new Buffer ac.length + rs.length
  ac.copy b, 0
  rs.copy b, ac.length
  -> b

text_chars = do ->
  b = new Buffer (c for c in [0x01..0x7F] when c != 10 and c != 13) # all except \r and \n
  -> b

space_list = (cb, none) ->
  results = []
  handler = cb()
  space = true
  i = 0
  (data) ->
    i += 1
    if not results.length
      return [] if i == 1 and none and data.buf[data.pos] == ')'.charCodeAt 0
      result = handler data
      return if typeof result == 'undefined'
      results.push result
      return

    if space
      if data.buf[data.pos] != ' '.charCodeAt 0
        return results
      space = false
      data.pos += 1
      handler = cb()
      return

    result = handler data
    return if typeof result == 'undefined'
    results.push result
    space = true
    return

nz_number = ->
  i = 0
  str = ''
  (data) ->
    for code in data.buf[data.pos...]
      if i == 0 and code not in [ 0x31 .. 0x39 ]
        err data, 'nz_number', 'First digit must be between 1 and 9'
      if code not in [ 0x30 .. 0x39 ]
        return parseInt str, 10
      data.pos += 1
      i += 1
      str += String.fromCharCode code

number = ->
  i = 0
  str = ''
  (data) ->
    for code in data.buf[data.pos...]
      if code not in [ 0x30 .. 0x39 ]
        if i == 0 then err data, 'nz_number', 'First digit must be between 1 and 9'
        else return parseInt str, 10
      data.pos += 1
      i += 1
      str += String.fromCharCode code


text = ->
  cr = "\r".charCodeAt 0
  lf = "\n".charCodeAt 0
  bufs = []
  col = collector()
  (data) ->
    for c, i in data.buf[data.pos...]
      if c in [cr, lf]
        col data.buf[data.pos...data.pos + i]
        data.pos += i
        all = col()
        return all if all

        err data, 'text', 'text must contain at least one character'

    col data.buf[data.pos...]
    data.pos = data.buf.length
    return


crlf = ->
  join parse [
    opt("\r"),
    str("\n")
  ]



bracket_wrap = (cb) ->
  wrap '[', ']', cb

paren_wrap = (cb) ->
  wrap '(', ')', cb

curly_wrap = (cb) ->
  wrap '{', '}', cb

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
      return buffer

opt = (c) ->
  (data) ->
    if data.buf[data.pos] == c.charCodeAt 0
      data.pos += 1
      return new Buffer c
    else
      return new Buffer 0

each = (ea, cb) ->
  (data) ->
    results = cb data
    (ea v for v in results) if typeof results != 'undefined'

wrap = (open, close, cb) ->
  pick 1, parse [
    str(open),
    cb(),
    str(close),
  ]

err = (data, rule, extra) ->
  throw new SyntaxError data, rule, extra

join = (cb) ->
  col = collector()
  (data) ->
    result = cb data
    if typeof result != 'undefined'
      (col b for b in result)
      return col()


oneof = (strs, nomatch) ->
  matches = strs
  i = 0
  (data) ->
    for code in data.buf[data.pos...]
      matches = (str for str in matches when str[i].charCodeAt(0) == code)
      i += 1
      data.pos += 1
      if not matches.length or matches.length == 1 and matches[0].length == i
        break

    if matches.length == 1 and matches[0].length == i
      return matches[0]
    else if matches.length == 0
      data.pos -= 1 # TODO this will break w/ more than 1 char per buffer
      if not nomatch then err data, 'oneof', 'No matches in ' + strs.join(',')
      else return null

pick = (ids, cb) ->
  (data) ->
    result = cb data
    return if typeof result == 'undefined'
    return if typeof ids == 'number' then result[ids] else (result[i] for i in ids)

route = (routes, nomatch) ->
  key_cb = oneof (k for own k,v of routes), nomatch
  key = null

  (data) ->
    if not key_cb
      return nomatch data
    else if not key
      result = key_cb data
      key = result if typeof result != 'undefined'
      if result == null
        key_cb = null
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
