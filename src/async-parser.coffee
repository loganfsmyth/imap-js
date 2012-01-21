

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
      @partial = true
      result = greet data
      return if not result
      @partial = data.pos != data.buf.length

      console.log 'Greeting:'
      console.log result

      @_response()
      @emit 'greeting', result

      return

  _response: () ->
    resp = response()
    @parser = (data) =>
      @partial = true
      result = resp data
      return if not result
      @partial = data.pos != data.buf.length

      console.log 'Response:'
      console.log result
      @_response()
      @emit 'response', result

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
    if not @writing
      if @partial then @emit 'error', new SyntaxError {pos:0,buf:new Buffer(0)},'destroy', 'Parser destroyed part-way through parsing'
      @destroy()
    return

  destroy: ->
    if not @destroyed
      @writable = false
      @destroyed = true
      @emit 'close'
    return


exports.SyntaxError = class SyntaxError extends Error
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


resp_text_code = ->
  space_num           = parse [ str(' '), number(true) ], 1
  badcharset_args     = parse [ str(' '), paren_wrap(space_list(astring())) ], 1
  capability_args     = parse [ str(' '), capability_data() ], 1
  permanentflags_args = parse [ str(' '), paren_wrap(space_list(flag_perm(), true)) ], 1
  atom_args           = parse [ str(' '), textchar_str() ], 1

  text_codes = route
    'ALERT':          null
    'BADCHARSET':     lookup({ ' ': badcharset_args, '': empty_resp() })
    'CAPABILITY':     capability_args
    'PARSE':          null
    'PERMANENTFLAGS': permanentflags_args
    'READ-ONLY':      null
    'READ-WRITE':     null
    'TRYCREATE':      null
    'UIDNEXT':        space_num
    'UIDVALIDITY':    space_num
    'UNSEEN':         space_num
  , parse [
      atom()
      lookup({' ': atom_args, '': null_resp() })
    ]

  zip ['key', 'value'], text_codes

empty_resp  = -> -> (data) -> []
null_resp   = -> -> (data) -> null

flag_perm = ->
  slash_flags = lookup
    '*': str('*')
    '': atom()

  lookup
    '\\': join parse [str('\\'), slash_flags]
    '': atom()

capability_data = ->
  space_list capability()

capability = ->
  atom()

crlf = ->
  join parse [
    opt("\r")
    str("\n")
  ]


bracket_wrap  = (cb) -> wrap '[', ']', cb
paren_wrap    = (cb) -> wrap '(', ')', cb
curly_wrap    = (cb) -> wrap '{', '}', cb



###################### Data Type helpers ###############

collect_until = (cb) ->
  ->
    col = collector()
    (data) ->
      i = cb data
      if typeof i == 'undefined'
        col data.buf[data.pos...]
        data.pos = data.buf.length
      else
        col data.buf[data.pos...data.pos+i]
        data.pos += i
        all = col()
        return all if all
        err data, 'collect_until', 'must have at least one value'
      return

textchar_str = ->
  chars = text_chars()
  brac = ']'.charCodeAt 0
  collect_until (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in chars or code == brac

atom = ->
  chars = atom_chars()
  collect_until (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in chars

astring = ->
  lookup {
    '{': string(),
    '"': string(),
    '': astring_str(),
  }

text = ->
  cr = "\r".charCodeAt 0
  lf = "\n".charCodeAt 0
  collect_until (data) ->
    for code, i in data.buf[data.pos...]
      return i if code in [cr, lf]

number = (nz) ->
  ->
    i = 0
    str = ''
    first_range = nz and [ 0x31 .. 0x39 ] or [ 0x30 .. 0x39 ]
    (data) ->
      for code in data.buf[data.pos...]
        if i == 0 and code not in first_range
          err data, 'number', 'First digit must be between #{if nz then 1 else 0} and 9'
        
        if code not in [ 0x30 .. 0x39 ]
          return parseInt str, 10
        data.pos += 1
        i += 1
        str += String.fromCharCode code

string = ->
  lookup {
    '{': literal(),
    '"': quoted(),
    '': ->
      (data) ->
        err data, 'string', 'Expected a { or " at the start of the string.'
  }


quoted = ->
  wrap '"', '"', quoted_inner()

quoted_inner = ->
  slash = '\\'.charCodeAt 0
  quote = '"'.charCodeAt 0
  ->
    escaped = 0
    col = collector()
    (data) ->
      for code,j in data.buf[data.pos...]
        if escaped%2 == 1 or code == slash
          escaped += 1
          continue

        if code == quote
          col data.buf[data.pos...data.pos+j]
          data.pos += j
          return col()

      col data.buf[data.pos...]
      data.pos = data.length



literal = (emit) ->
  size = literal_size()
  nl = crlf()
  literal_dat = literal_data(emit)
  ->
    size_cb = size()
    nl_cb = nl()
    dat = null
    length = 0
    (data) ->
      if size_cb
        result = size_cb data
        return if typeof result == 'undefined'
        length = result
        size = null
        dat = literal_dat length

      if nl
        result = nl data
        return if typeof result == 'undefined'
        nl = null

      result = dat data
      return result if typeof result != 'undefined'

literal_size = ->
  curly_wrap number()

literal_data = (emit) ->
  (size) ->
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
  chars = astring_chars()
  ->
    col = collector()
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

# Match a given string
str = (s) ->
  buffer = new Buffer s
  ->
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


############## Character Set functions  #############

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




####################### Parser Helpers  ################

lookup = (map) ->
  for own k,v of map
    delete map[k]
    if k == ''
      map[0] = v
    else
      k = k.charCodeAt 0
      map[k] = v
  ->
    handler = null
    (data) ->
      if not handler
        c = data.buf[data.pos]
        handler = if map[c] then map[c]() else map[0]()
      handler data


# Use one parser if the buffer starts with one char, and another if not
starts_with = (c, y, n) ->
  code = c.charCodeAt 0
  ->
    handler = null
    (data) ->
      if not handler
        start = false
        handler = y() if data.buf[data.pos] == code else n()
      handler data

ifset = (c, cb) ->
  code = c.charCodeAt 0
  ->
    handler = null
    (data) ->
      if not handler
        return null if data.buf[data.pos] != code
        handler = cb()
      handler data


space_list = (cb, none) ->
  sp = ' '.charCodeAt 0
  paren = ')'.charCodeAt 0
  ->
    results = []
    handler = cb()
    space = true
    i = 0
    (data) ->
      console.log data
      i += 1
      if not results.length
        return [] if i == 1 and none and data.buf[data.pos] == paren
        result = handler data
        return if typeof result == 'undefined'
        results.push result
        return

      if space
        if data.buf[data.pos] != sp
          console.log results
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


opt = (c) ->
  code = c.charCodeAt 0
  ->
    (data) ->
      if data.buf[data.pos] == code
        data.pos += 1
        return new Buffer c
      else
        return new Buffer 0

wrap = (open, close, cb) ->
  parse [
    str(open),
    cb,
    str(close),
  ], 1

err = (data, rule, extra) ->
  throw new SyntaxError data, rule, extra

join = (cb) ->
  ->
    col = collector()
    data_cb = cb()
    (data) ->
      result = data_cb data
      if typeof result != 'undefined'
        (col b for b in result)
        return col()


oneof = (strs, nomatch) ->
  # TODO preconvert chars to buffers here
  ->
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

route = (routes, nomatch) ->
  key_cb = oneof (k for own k,v of routes), nomatch
  ->
    key = null
    key_func = key_cb()
    nomatch_func = null
    route_func = null
    (data) ->
      if not key_func
        return nomatch_func data
      else if not route_func
        key = key_func data
        return if typeof key == 'undefined'
        if key == null
          key_func = null
          nomatch_func = nomatch()
        else if routes[key]
          route_func = routes[key]()
        else
          return [key, null]
      else if route_func
        result = route_func data
        if typeof result != 'undefined'
          return [key, result]
      return

# Given an array of match functions, parse until all are complete and return
# array containing the results
parse = (parts, ids) ->
  ->
    i = 0
    handler = parts[i]()
    ret = []
    (data) ->
      result = handler data
      return if typeof result == 'undefined'

      ret.push result
      i += 1
      if parts.length == i
        return if typeof ids == 'undefined'
          ret
        else if typeof ids == 'number'
          ret[ids]
        else
          (ret[j] for j in ids)
      handler = parts[i]()
      return

# Zip an array of keys and a callback that returns an array
zip = (keys, cb) ->
  ->
    data_cb = cb()
    (data) ->
      result = data_cb data
      return if typeof result == 'undefined'

      ret = {}
      for k, i in keys when k
        ret[k] = result[i]
      return ret


l = (data) ->
  console.log data.buf[data.pos...]
  console.log data.buf.toString('utf8', data.pos)

greeting = do ->
  text_code = parse [ bracket_wrap(resp_text_code()), str(' ') ], 0

  zip [ null, 'type', null, 'text-code', 'text'], parse [
    str('* '),
    oneof(['OK', 'PREAUTH', 'BYE']),
    str(' '),
    ifset('[', text_code),
    text(),
    crlf()
  ]



response = do ->
  ->
    (data) ->

