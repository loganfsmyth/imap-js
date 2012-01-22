

Stream = require 'stream'
util = require 'util'

print = (obj) ->
  console.log util.inspect obj, false, 20

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
      #console.log result
      print result
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

greeting = ->
  zip [ null, 'type', null, 'text-code', 'text'], series [
    str('* '),
    oneof(['OK', 'PREAUTH', 'BYE']),
    str(' '),
    ifset('[', text_code()),
    text(),
    crlf()
  ]

text_code = ->
  series [ bracket_wrap(resp_text_code()), str(' ') ], 0

response = ->
  zip ['type', 'response'], lookup
    '+': continue_req()
    '*': response_untagged() # or response-fatal
    '': response_tagged()


response_tagged = ->
  cb = series [
    tag()
    str ' '
    oneof ['OK', 'PREAUTH', 'BYE']
    str ' '
    ifset '[', text_code()
    text()
    crlf()
  ]

  cb = zip ['tag', null, 'type', null, 'text-code', 'text'], cb

  series [
    -> (data) -> 'tagged'
    cb
  ]

continue_req = ->

response_untagged = ->
  cb = series [
    str '* '
    response_data_types()
    crlf()
  ], 1

  series [
    -> (data) -> 'tagged'
    cb
  ]

response_data_types = ->
  resp_text = series [
    str ' '
    ifset '[', text_code()
    text()
  ], [1,2]

  zip ['key', 'val'], route {
# cond-state
    "OK": resp_text
    "NO": resp_text
    "BAD": resp_text
# cond-bye
    "BYE": resp_text
#mailbox-data
    "FLAGS": series [ str(' '), flag_list() ], 1
    "LIST": series [ str(' '), mailbox_list() ], 1
    "LSUB": series [ str(' '), mailbox_list() ], 1
    "SEARCH": ifset ' ', series([ str(' '), space_list(number(true)) ], 1)
    "STATUS": series [
      str ' '
      mailbox()
      str ' '
      paren_wrap status_att_list()
    ], [1, 3]
    # number EXISTS | RECENT
#message-data
    # nz-number EXPUNGE | FETCH msg-att
# capability-data
    "CAPABILITY": capability_args()
  }, response_numeric_types()

response_numeric_types = () ->
  types = route
    'EXISTS': null
    'RECENT': null
    'EXPUNGE': null
    'FETCH': series [ str(' '), msg_att() ], 1

  cb = series [
    str ' '
    types
  ], 1

  onres cb, (result, num) ->
    [result[0], { 'id': num, 'value': result[1]} ]


sp = -> str ' '

msg_att = ->

  body_struc = series [ sp(), body() ], 1
  rfc_text = series [ sp(), nstring() ], 1

  body_section_data = series [
    section()
    starts_with '<', wrap('<', '>', number()), null_resp()
    sp()
    nstring()
  ]


  paren_wrap space_list route
    'FLAGS': series [ sp(), paren_wrap(space_list(flag(false), true)) ], 1
    'ENVELOPE': series [ sp(), envelope() ], 1
    'INTERNALDATE': series [ sp(), date_time() ], 1
    'RFC822': rfc_text
    'RFC822.HEADER': rfc_text
    'RFC822.TEXT': rfc_text
    'RFC822.SIZE': series [ sp(), number() ], 1
    'BODYSTRUCTURE': body_struc
    'BODY': starts_with ' ', body_struc, body_section_data
    'UID': series [ sp(), uniqueid() ], 1

envelope = ->
  cb = paren_wrap series [
    env_date(),       sp()
    env_subject(),    sp()
    env_from(),       sp()
    env_sender(),     sp()
    env_reply_to(),   sp()
    env_to(),         sp()
    env_cc(),         sp()
    env_bcc(),        sp()
    env_in_reply_to(),sp()
    env_message_id()
  ]

  zip [
    'date',     null
    'subject',  null
    'from',     null
    'sender',   null
    'reply-to', null
    'to',       null
    'cc',       null
    'bcc',      null
    'in-reply-to', null
    'message-id'
  ], cb

env_date = env_subject = env_message_id = env_in_reply_to = ->
  nstring()

env_from = env_sender = env_reply_to = env_to = env_cc = env_bcc = ->
  starts_with 'N',
    nil(),
    paren_wrap nosep_list address()

date_time = ->
  cb = series [
    str '"'
    series [
      starts_with ' ', series([sp(), digits(1)]), digits(2)
      str '-'
      oneof ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      str '-'
      digits(4)
    ]
    sp()
    time()
    sp()
    zone()
    str '"'
  ]

  zip [null, 'date', null, 'time', null, 'zone'], cb

time = ->
  join series [
    digits 2
    str ':'
    digits 2
    str ':'
    digits 2
  ]
zone = ->
  series [ oneof(['-', '+']), digits(4) ]

nstring = ->
  starts_with 'N', nil(), string()

address = ->
  cb = paren_wrap series [
    addr_name()
    sp()
    addr_adl()
    sp()
    addr_mailbox()
    sp()
    addr_host()
  ]

  zip ['name', null, 'adl', null, 'mailbox', null, 'host'], cb

addr_name = addr_adl = addr_mailbox = addr_host = ->
  nstring()


digits = (num) ->
  collect_until ->
    i = 0
    (data) ->
      for code, j in data.buf[data.pos...]
        i++
        if code not in [0x30..0x39]
          err data, 'digits', 'expected a number between 0 and 9'

        if i == num
          return j+1
      return


body = ->
  

section = ->
  bracket_wrap section_spec()

section_msgtext = ->
  route
    "HEADER": null
    "HEADER.FIELDS": series [ sp(), header_list() ], 1
    "HEADER.FIELDS.NOT": series [ sp(), header_list() ], 1
    "TEXT": null

section_spec = ->
  # TODO more
  section_msgtext()

header_list = ->
  paren_wrap space_list header_fld_name()

header_fld_name = ->
  astring()


uniqueid = ->
  number(true)

flag_list = ->
  paren_wrap space_list flag(), true

mailbox_list = ->
  series [
    paren_wrap mbx_list_flags()
    str ' '
    starts_with '"', quoted_char(), nil()
    str ' '
    mailbox()
  ], [0, 2, 4]

mbx_list_flags = ->
  space_list join(series [ str('\\'), atom() ]), true

nil = ->
  onres str('NIL'), (result) ->
    return null

quoted_char = ->
  wrap '"', '"', quoted_char_inner()

quoted_char_inner = ->
  quote = '"'.charCodeAt 0
  slash = '\\'.charCodeAt 0
  chars = text_chars()
  ->
    escaped = false
    (data) ->
      if not escaped
        code = data.buf[data.pos]
        if code == slash
          escaped = true
          data.pos += 1
        else if code in chars and code != quote
          data.pos += 1
          return data.buf[data.pos-1...data.pos]
        else
          err data, 'quoted_char_inner', 'must contain a text-char and no unescaped quotes'

      return if data.pos >= data.buf.length

      code = data.buf[data.pos]
      if code in [quote, slash]
        data.pos += 1
        return data.buf[data.pos-1...data.pos]
      else
        err data, 'quoted_char_inner', 'Only quotes and slashes can be escaped'


mailbox = ->
  astring()

status_att_list = ->
  status_att_pair = series [
    oneof [
      'MESSAGES'
      'RECENT'
      'UIDNEXT'
      'UIDVALIDITY'
      'UNSEEN'
    ]
    str ' '
    number()
  ], [0, 2]

  space_list status_att_pair, true


tag = ->
  chars = astring_chars()
  collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in chars

resp_text_code = ->
  space_num           = series [ str(' '), number true ], 1
  badcharset_args     = series [ str(' '), paren_wrap space_list astring() ], 1

  permanentflags_args = series [ str(' '), paren_wrap space_list(flag(true), true) ], 1

  atom_args = lookup
    ' ': series [ str(' '), textchar_str() ], 1
    '': null_resp()

  text_codes = route
    'ALERT':          null
    'BADCHARSET':     lookup({ ' ': badcharset_args, '': empty_resp() })
    'CAPABILITY':     capability_args()
    'PARSE':          null
    'PERMANENTFLAGS': permanentflags_args
    'READ-ONLY':      null
    'READ-WRITE':     null
    'TRYCREATE':      null
    'UIDNEXT':        space_num
    'UIDVALIDITY':    space_num
    'UNSEEN':         space_num
  , (key) ->
      handler = atom_args()
      (data) ->
        result = handler data
        return if typeof result == 'undefined'
        return [key, result]

  zip ['key', 'value'], text_codes

empty_resp  = -> -> (data) -> []
null_resp   = -> -> (data) -> null

flag = (star) ->
  slash_flags = if star
    lookup
      '*': str('*')
      '': atom()
  else
    atom()

  lookup
    '\\': join series [str('\\'), slash_flags]
    '': atom()

capability_args = ->
  series [ str(' '), capability_data() ], 1

capability_data = ->
  space_list capability()

capability = ->
  atom()

crlf = ->
  join series [
    opt "\r"
    str "\n"
  ]


bracket_wrap  = (cb) -> wrap '[', ']', cb
paren_wrap    = (cb) -> wrap '(', ')', cb
curly_wrap    = (cb) -> wrap '{', '}', cb



###################### Data Type helpers ###############

astring = ->
  lookup {
    '{': string(),
    '"': string(),
    '': astring_str(),
  }

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

collect_until = (cb, none) ->
  (arg)->
    col = collector()
    handler = cb arg
    (data) ->
      i = handler data
      if typeof i == 'undefined'
        col data.buf[data.pos...]
        data.pos = data.buf.length
      else
        col data.buf[data.pos...data.pos+i]
        data.pos += i
        all = col()
        return all if all or none
        err data, 'collect_until', 'must have at least one value'
      return

textchar_str = ->
  chars = text_chars()
  brac = ']'.charCodeAt 0
  collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in chars or code == brac

atom = ->
  chars = atom_chars()
  collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in chars


text = ->
  cr = "\r".charCodeAt 0
  lf = "\n".charCodeAt 0
  collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code in [cr, lf]


quoted_inner = ->
  slash = '\\'.charCodeAt 0
  quote = '"'.charCodeAt 0
  collect_until ->
    escaped = 0
    (data) ->
      for code, i in data.buf[data.pos...]
        if escaped%2 == 1 or code == slash
          escaped += 1
          
          if code not in [slash, quote]
            err data, 'quoted_inner', 'Quoted strings can only escape quotes and slashes'
          continue
        return i if code == quote
  , true

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
  collect_until (size) ->
    remaining = size
    (data) ->
      len = Math.min data.buf.length - data.pos, size
      remaining -= len
      buf = data.buf[data.pos ... data.pos+len]
      data.pos += len
      for code in buf when code not in [0x01..0xFF]
        err data, 'literal_data', 'Literals can only bytes between 1 and 255'
      return len if remaining == 0
  , true

astring_str = ->
  chars = astring_chars()
  collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in chars

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
  cmp = {}
  cmp[c] = y
  cmp[''] = n
  lookup cmp

ifset = (c, cb) ->
  starts_with c, cb, null_resp()

nosep_list = (cb, end_char, allow_none) ->
  end_char ?= ')'
  close_code = end_char.charCodeAt 0
  ->
    results = []
    handler = cb()
    check_done = !!allow_none
    i = 0
    (data) ->
      if check_done
        return results if data.buf[data.pos] == close_code
        check_done = false

      result = handler data
      return if typeof result == 'undefined'
      results.push result
      handler = cb()
      check_done = true
      return

space_list = (cb, none) ->

  spcode = ' '.charCodeAt 0
  paren = ')'.charCodeAt 0
  ->
    results = []
    handler = cb()
    space = true
    i = 0
    (data) ->
      i += 1
      if not results.length
        return [] if i == 1 and none and data.buf[data.pos] == paren
        result = handler data
        return if typeof result == 'undefined'
        results.push result
        return

      if space
        if data.buf[data.pos] != spcode
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
  starts_with c,
    (-> (data) -> new Buffer c),
    (-> (data) -> new Buffer 0)

wrap = (open, close, cb) ->
  series [
    str open
    cb
    str close
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

route_key = ->
  nums = [0x30..0x39]
  upper = [0x41..0x5A]
  lower = [0x61..0x7A]
  dash = '-'.charCodeAt 0
  dot = '.'.charCodeAt 0
  collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in [dash,dot] and code not in nums and code not in upper and code not in lower

route = (routes, nomatch) ->
  key_cb = route_key()
  ->
    key = null
    key_func = key_cb()
    nomatch_func = null
    route_func = null
    (data) ->
      if nomatch_func
        return nomatch_func data
      else if not route_func
        key = key_func data
        return if typeof key == 'undefined'
        key_str = key.toString 'ascii'
        if routes[key_str]
          route_func = routes[key_str]()
        else if typeof routes[key] == 'undefined'
          if nomatch
            nomatch_func = nomatch key
          else
            err data, 'route', "key #{key_str} is not a valid route in " + (k for own k,v of routes)
        else
          return [key, null]
      else if route_func
        result = route_func data
        if typeof result != 'undefined'
          return [key, result]
      return

# Given an array of match functions, parse until all are complete and return
# array containing the results
series = (parts, ids) ->
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
  onres cb, (result) ->
    ret = {}
    for k, i in keys when k
      ret[k] = result[i]
    return ret

onres = (cb, res_cb) ->
  (args...)->
    handler = cb()
    (data) ->
      result = handler data
      return if typeof result == 'undefined'

      return res_cb result, args...

l = (data) ->
  console.log data.buf[data.pos...]
  console.log data.buf.toString('utf8', data.pos)

greeting = greeting()
response = response()

