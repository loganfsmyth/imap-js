#
# imap-js - Copyright (c) 2011 Logan Falconer Smyth
#
# Dual licensed under MIT and GPL licenses.
# See MIT-LICENSE.txt and GPL-LICENSE.txt

Stream = require 'stream'
{Iconv} = require 'iconv'

utf7to8 = new Iconv 'UTF-7', 'UTF-8'

module.exports = class Parser extends Stream
  @CLIENT = CLIENT = 0x01
  @SERVER = SERVER = 0x02
  @createParser = (type, emit, cb) ->

    if typeof emit == 'function'
      cb = emit
      emit = null

    p = new Parser type, emit
    p.on 'greeting', cb if cb
    return p
  constructor: (@type, @shouldEmit) ->
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

      #console.log 'Greeting:'
      #console.log result

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

      @_response()
      {type, response} = result

      return if type not in ['tagged', 'untagged', 'continuation']
      @emit type, response

      return

  _command: ->
    cmd = command()
    @parser = (data) =>
      @partial = true
      result = cmd data
      return if not result
      @partial = data.pos != data.buf.length

      @_command()
      @emit 'command', result

      return

  _handleEmit: (type, buf, arg, remaining, name) ->
    @_count ?= 10
    name ?= 'C' + (@_count++)
    @emit type, buf, arg, remaining
    return name

  write: (buffer, encoding) ->
    buffer = new Buffer buffer, encoding if not Buffer.isBuffer buffer
    @writing = true

    data =
      buf: buffer
      pos: 0
      emit: @shouldEmit and (args...) => @_handleEmit args...

    while not @destroyed and data.pos < buffer.length
      try
        @parser data
      catch e
        #throw e if e not instanceof SyntaxError
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


module.exports.SyntaxError = class SyntaxError extends Error
  constructor: (data, rule = '', extra = '') ->
    context = 30
    @name = "IMAPSyntaxError"
    {pos, buf} = data

    start = Math.max pos - context, 0
    end = Math.min pos + context, buf.length

    error = pos - start

    @message =
      rule + (extra and "\n" + extra) + "\n" +
      "==" + buf.toString('utf8', start, end) + "==\n" +
      "  " + (" " for i in [0...error]).join('') + "^\n"


modifiedUtf7ToUtf8 = (data) ->
  result = ''
  start = -1
  for i in [0...data.length]
    if data[i] == '-'
      if start >= 0
        if i-start == 0
          result += '&'
        else
          result += utf7to8.convert data.slice(start, i+1).replace('&', '+').replace(',', '/')
        start = -1
      else
        result += '-'
    else if start >= 0

    else if data[i] == '&'
      start = i
    else
      result += data[i]
  return result


cache = (func) ->
  cb = null
  ->
    ->
      if not cb
        cb = func()
      cb()

greeting = ->
  zip [ null, 'type', null, 'text-code', 'text'], series [
    str('* '),
    oneof(['OK', 'PREAUTH', 'BYE'], false, true),
    sp()
    ifset('[', text_code()),
    text(),
    crlf()
  ]


response = ->
  zip ['type', 'response'], lookup
    '+': continue_req()
    '*': response_untagged() # or response-fatal
    '': response_tagged()


response_tagged = ->
  cb = series [
    tag()
    sp()
    oneof ['OK', 'NO', 'BAD'], false, true
    sp()
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
  cb = series [
    str '+ '
    ifset '[', text_code()
    text()
    crlf()
  ]
  cb = zip [ null, 'text-code', 'text'], cb
  
  series [
    -> (data) -> 'continuation'
    cb
  ]

response_untagged = ->
  cb = series [
    str '* '
    response_data_types()
    crlf()
  ], 1

  series [
    -> (data) -> 'untagged'
    cb
  ]

response_data_types = ->
  resp_text = series [
    sp()
    ifset '[', text_code()
    text()
  ], [1,2]

  cb = route {
    # cond-state
    "OK": resp_text
    "NO": resp_text
    "BAD": resp_text
    # cond-bye
    "BYE": resp_text
    #mailbox-data
    "FLAGS": series [ sp(), flag_list() ], 1
    "LIST": series [ sp(), mailbox_list() ], 1
    "LSUB": series [ sp(), mailbox_list() ], 1
    "SEARCH": starts_with ' ', series([ sp(), space_list(number(true)) ], 1), empty_resp()
    "STATUS": zip [null, 'mailbox', null, 'attributes'], series [
      sp()
      mailbox()
      sp()
      onres paren_wrap(status_att_list()), (result) ->
        obj = {}
        for r in result
          obj[r[0]] = r[1]
        return obj
    ]
    # capability-data
    "CAPABILITY": capability_args()
  }, response_numeric_types()


  onres cb, (result) ->
    key = result[0].toString 'ascii'
    switch key
      when 'OK', 'NO', 'BAD', 'BYE'
        'type': key
        'text-code': result[1][0]
        'text': result[1][1]
      when 'CAPABILITY', 'FLAGS', 'LIST', 'LSUB', 'SEARCH', 'STATUS'
        'type': key
        'value': result[1]
      else
        'type': key
        'value': result[2]
        'id': parseInt result[1], 10

response_numeric_types = () ->
  space_cb = sp()
  fetch_cb = str 'FETCH'
  msg_att_cb = msg_att()

  fetch_resp = (key) ->
    space = space_cb()
    fetch_handler = fetch_cb()
    msg_att_handler = msg_att_cb key
    (data) ->
      if fetch_handler
        return if not fetch_handler data
        if key[0] == 0x30
          err data, 'fetch_resp', 'FETCH ids must be positive'
        fetch_handler = null
      if space
        return if not space data
        space = null
      result = msg_att_handler data
      return if typeof result == 'undefined'
      return ['FETCH', key, result]

  other_kw = oneof ['EXISTS', 'RECENT', 'EXPUNGE']
  other_resp = (key) ->
    handler = other_kw()
    (data) ->
      result = handler data
      return if typeof result == 'undefined'
      if result == 'EXPUNGE' and key[0] == 0x30
        err data, 'expunge_resp', 'EXPUNGE ids must be positive'
      return [result, key]

  f_code = 'F'.charCodeAt 0

  (key) ->
    handler = null
    space = space_cb()
    (data) ->
      if space
        return if not space data
        space = null
      if not handler
        if data.buf[data.pos] == f_code
          handler = fetch_resp key
        else
          handler = other_resp key
      handler data

sp = cache ->
  str ' '

text_code = cache ->
  series [ bracket_wrap(resp_text_code()), sp() ], 0


body_section_data = ->
  section_cb = section()
  partial_cb = starts_with '<', wrap('<', '>', number()), null_resp()
  space_cb = sp()
  body_cb = starts_with 'N', nil(), string('body')


  (id) ->
    section_handler = section_cb()
    partial_handler = partial_cb()
    space_handler = space_cb()
    body_handler = body_cb()
    body_data = {}
    (data) ->
      if section_handler
        sec = section_handler data
        return if typeof sec == 'undefined'
        body_data.section = sec
        section_handler = null
      if partial_handler
        par = partial_handler data
        return if typeof par == 'undefined'
        body_data.partial = par
        partial_handler = null
      if space_handler
        return if not space_handler data
        space_handler = null

      data.emit_arg = body_data
      res = body_handler data
      return if typeof res == 'undefined'
      body_data.value = res
      return body_data

msg_att = ->

  body_struc = series [ sp(), body() ], 1
  rfc_text = series [ sp(), nstring() ], 1

  paren_wrap space_list zip ['type', 'value'], route
    'FLAGS': series [ sp(), paren_wrap(space_list(flag(false), ')')) ], 1
    'ENVELOPE': series [ sp(), envelope() ], 1
    'INTERNALDATE': series [ sp(), date_time() ], 1
    'RFC822': rfc_text
    'RFC822.HEADER': rfc_text
    'RFC822.TEXT': rfc_text
    'RFC822.SIZE': series [ sp(), number() ], 1
    'BODYSTRUCTURE': body_struc
    'BODY': starts_with ' ', body_struc, body_section_data()
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

date_text = ->
  join series [
    starts_with ' ', series([sp(), digits(1)]), digits(2)
    str '-'
    oneof(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], false, true)
    str '-'
    digits(4)
  ]

date_time = ->
  cb = join series [
    str '"'
    starts_with ' ', series([sp(), digits(1)]), digits(2)
    str '-'
    oneof(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], false, true)
    str '-'
    digits(4)
    sp()
    time()
    sp()
    zone()
    str '"'
  ], [1,2,3,4,5,6,7,8,9]

  onres cb, (result) -> new Date result

time = ->
  join series [
    digits 2
    str ':'
    digits 2
    str ':'
    digits 2
  ]
zone = ->
  join series [ 
    oneof(['-', '+'])
    digits(4)
  ]


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




body_ext_mpart = ->
  zip ['param', 'dsp', 'lang', 'loc', 'ext'], series [
    body_fld_param()
    ifset ' ', series [ sp(), body_fld_dsp() ], 1
    ifset ' ', series [ sp(), body_fld_lang() ], 1
    ifset ' ', series [ sp(), body_fld_loc() ], 1
    ifset ' ', series [ sp(), body_extension() ], 1
  ]

body_ext_1part = ->
  zip ['md5', 'dsp', 'lang', 'loc', 'ext'], series [
    body_fld_md5()
    ifset ' ', series [ sp(), body_fld_dsp() ], 1
    ifset ' ', series [ sp(), body_fld_lang() ], 1
    ifset ' ', series [ sp(), body_fld_loc() ], 1
    ifset ' ', series [ sp(), body_extension() ], 1
  ]

body_fld_md5 = -> nstring()
body_fld_dsp = ->
  params = zip ['name', null, 'values'], paren_wrap series [
    string()
    sp()
    body_fld_param()
  ]

  starts_with '(', params, nil()

body_fld_param = ->
  paren_wrap space_list zip ['key', null, 'value'], series [ string(), sp(), string() ]

body_fld_lang = ->
  starts_with '(', paren_wrap(space_list(string())), nstring()

body_fld_loc = ->
  nstring()

body_extension = cache ->
  map = {}
  for n in [0..9]
    map[n] = number()

  map['('] = paren_wrap space_list body_extension()
  map[''] = nstring()

  lookup map


media_subtype = ->
  string()

body_type_mpart = ->
  series [
    nosep_list(-> do body())
    sp()
    media_subtype()
    ifset ' ', series [sp(), body_ext_mpart()], 1
  ], [0, 2, 3]


body_type_1part = ->
  series [
    body_type_1part_main()
    ifset ' ', series [ sp(), body_ext_1part() ], 1
  ]

body_fld_lines = -> number()
body_fld_id = -> nstring()
body_fld_desc = -> nstring()
body_fld_enc = -> string()
body_fld_octets = -> number()

body_type_1part_main = ->
  cb = series [
    string()
    sp()
    media_subtype()
  ], [0, 2]

  body_fields = zip ['param', null, 'id', null, 'desc', null, 'enc', null, 'octets'], series [
    body_fld_param()
    sp()
    body_fld_id()
    sp()
    body_fld_desc()
    sp()
    body_fld_enc()
    sp()
    body_fld_octets()
  ]


  body_type_msg = zip [null, 'fields', null, 'env', null, 'body', null, 'lines'], series [
    sp()
    body_fields
    sp()
    envelope()
    sp()
    body()
    sp()
    body_fld_lines()
  ]

  body_type_text = zip [null, 'fields', null, 'lines'], series [
    sp()
    body_fields
    sp()
    body_fld_lines()
  ]

  body_type_basic = zip [null, 'fields'], series [
    sp()
    body_fields
  ]

  ->
    handler = cb()
    media = null
    (data) ->
      if not media
        result = handler data
        return if typeof result == 'undefined'
        media = result
        type = media[0].toString('ascii').toUpperCase()
        subtype = media[1].toString('ascii').toUpperCase()
        if type == 'MESSAGE' && subtype == 'RFC822'
          # media-message
          handler = body_type_msg()
        else if type == 'TEXT'
          # media-text
          handler = body_type_text()
        else
          # media-basic
          handler = body_type_basic()
      result = handler data
      return if typeof result == 'undefined'
      
      result.type = media[0]
      result.subtype = media[1]

      return result


body = cache ->
  paren_wrap starts_with '(', body_type_mpart(), body_type_1part()

section = ->
  bracket_wrap starts_with ']', null_resp(), section_spec()

section_msgtext = (showmine) ->
  routes =
    "HEADER": null
    "HEADER.FIELDS": series [ sp(), header_list() ], 1
    "HEADER.FIELDS.NOT": series [ sp(), header_list() ], 1
    "TEXT": null

  if showmine
    routes['MIME'] = null

  route routes

section_spec = ->
  starts_with 'H', section_msgtext(), starts_with 'T', section_msgtext(), section_parts()


section_parts = ->
  num = number true
  dot = '.'.charCodeAt 0
  codes = ['H'.charCodeAt(0), 'T'.charCodeAt(0), 'M'.charCodeAt(0)]
  ->
    num_cb = num()
    num_found = 0
    next_cb = null
    (data) ->
      if next_cb
        result = next_cb data
        return if typeof result == 'undefined'
        result.unshift num_found
        return result
      if num_found
        return [ num_found ] if data.buf[data.pos] != dot
        
        data.pos += 1
        next_cb = (data) ->
          if data.buf[data.pos] in codes
            tmp = onres section_msgtext(true), (result) ->
              return [result]
            next_cb = tmp()
          else 
            next_cb = section_parts()()
          return
      else
        result = num_cb data
        return if typeof result == 'undefined'
        num_found = result
      return

header_list = ->
  paren_wrap space_list header_fld_name()

header_fld_name = ->
  astring()


uniqueid = ->
  number(true)

flag_list = ->
  paren_wrap space_list flag(), ')'

mailbox_list = ->
  zip [ 'flags', null, 'char', null, 'mailbox' ], series [
    paren_wrap mbx_list_flags()
    sp()
    starts_with '"', quoted_char(), nil()
    sp()
    mailbox()
  ]

mbx_list_flags = ->
  space_list join(series [ str('\\'), atom() ]), ')'

nil = cache ->
  onres str('NIL', true), (result) ->
    return null

quoted_char = ->
  wrap '"', '"', quoted_char_inner()

quoted_char_inner = ->
  quote = '"'.charCodeAt 0
  slash = '\\'.charCodeAt 0
  chars = text_chars()
  cb = ->
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

  onres cb, (r) -> r.toString('ascii').replace /\\([\\"])/, '$1'


mailbox = cache ->
  cb = astring()
  onres cb, modifiedUtf7ToUtf8

status_att = ->
  oneof [
    'MESSAGES'
    'RECENT'
    'UIDNEXT'
    'UIDVALIDITY'
    'UNSEEN'
  ], false, true

status_att_list = ->
  status_att_pair = series [
    status_att()
    sp()
    number()
  ], [0, 2]

  space_list status_att_pair, ')'


tag = ->
  chars = astring_chars()
  cb = collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in chars

  onres cb, (result) -> result.toString 'ascii'

resp_text_code = ->
  space_num           = series [ sp(), number true ], 1
  badcharset_args     = series [ sp(), paren_wrap space_list astring() ], 1

  permanentflags_args = series [ sp(), paren_wrap space_list(flag(true), ')') ], 1

  atom_args = lookup
    ' ': series [ sp(), textchar_str() ], 1
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
  series [ sp(), capability_data() ], 1

capability_data = ->
  space_list capability()

capability = ->
  atom()

crlf = cache ->
  join series [
    opt "\r"
    str "\n"
  ]


bracket_wrap  = (cb) -> wrap '[', ']', cb
paren_wrap    = (cb) -> wrap '(', ')', cb
curly_wrap    = (cb) -> wrap '{', '}', cb



###################### Data Type helpers ###############

astring = cache ->
  lookup {
    '{': string(),
    '"': string(),
    '': astring_str(),
  }

nstring = cache ->
  starts_with 'N', nil(), string()

digits = (num) ->
  cb = collect_until ->
    i = 0
    (data) ->
      for code, j in data.buf[data.pos...]
        i++
        if code not in [0x30..0x39]
          err data, 'digits', 'expected a number between 0 and 9'

        if i == num
          return j+1
      return

  onres cb, (r) -> r.toString 'ascii'

number = (nz) ->
  ->
    i = 0
    s = ''
    first_range = nz and [ 0x31 .. 0x39 ] or [ 0x30 .. 0x39 ]
    (data) ->
      for code in data.buf[data.pos...]
        if i == 0 and code not in first_range
          err data, 'number', 'First digit must be between #{if nz then 1 else 0} and 9'
        if code not in [ 0x30 .. 0x39 ]
          return parseInt s, 10
        data.pos += 1
        i += 1
        s += String.fromCharCode code

string = (emit)->
  lookup {
    '{': literal(emit),
    '"': quoted(emit),
    '': ->
      (data) ->
        err data, 'string', 'Expected a { or " at the start of the string.'
  }

quoted = (emit) ->
  wrap '"', '"', quoted_inner(emit)

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
        col data.buf[data.pos...data.pos+i] if i != 0
        data.pos += i
        all = col()
        return all if all or none
        err data, 'collect_until', 'must have at least one value'
      return

textchar_str = ->
  chars = text_chars()
  brac = ']'.charCodeAt 0
  cb = collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in chars or code == brac

  onres cb, (result) -> result.toString 'ascii'

atom = cache ->
  chars = atom_chars()
  cb = collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in chars
  onres cb, (result) -> result.toString 'ascii'


text = cache ->
  cr = "\r".charCodeAt 0
  lf = "\n".charCodeAt 0
  cb = collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code in [cr, lf]

  onres cb, (result) -> result.toString 'ascii'

collector_emit = (type, cb) ->
  placeholder = null
  (d, arg, remaining = null) ->
    if d
      placeholder ?= cb type, d, arg, remaining, placeholder
    else
      return placeholder
    return

quoted_inner = (emit)->
  slash = '\\'.charCodeAt 0
  quote = '"'.charCodeAt 0

  ->
    col = null
    placeholder
    init = false
    escaped = false
    (data) ->
      if not init
        init = true
        if emit and data.emit
          col = collector_emit emit, data.emit
        else
          col = collector true

      start = 0
      for code, i in data.buf[data.pos...]
        if escaped
          escaped = false
          if code not in [slash, quote]
            err data, 'quoted_inner', 'Quoted strings can only escape quotes and slashes'
        else if code == slash
          col data.buf[start...i], data.emit_arg if start != i
          escaped = true
          start = i+1
        else if code == quote
          col data.buf[start...i], data.emit_arg if start != i
          return col()

      col data.buf[start...] if start != data.buf.length


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
        size_cb = null
        dat = literal_dat length

      if nl_cb
        result = nl_cb data
        return if typeof result == 'undefined'
        nl_cb = null

      result = dat data
      return result if typeof result != 'undefined'


literal_size = ->
  curly_wrap number()

literal_data = (emit)->
  (size) ->
    init = false
    col = null
    placeholder = null
    remaining = size
    (data) ->
      if not init
        init = true
        if not emit or not data.emit
          col = collector true
        else
          col = collector_emit emit, data.emit

      len = Math.min data.buf.length - data.pos, remaining
      remaining -= len
      buf = data.buf[data.pos ... data.pos+len]
      data.pos += len
      for code in buf when code < 0x01 or code > 0xFF
        err data, 'literal_data', 'Literals can only bytes between 1 and 255'

      col buf, data.emit_arg, remaining

      if remaining == 0
        return col().toString 'binary'

astring_str = ->
  chars = astring_chars()
  cb = collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in chars

  onres cb, (r) -> r.toString 'ascii'

list_char_str = ->
  chars = list_chars()
  cb = collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      if code not in chars
        return i

  onres cb, (r) -> r.toString 'ascii'

# Match a given string
str = (s, insens) ->
  s = s.toUpperCase() if insens
  buffer = new Buffer s
  mask = if insens then 0xEF else 0xFF
  ->
    i = 0
    (data) ->
      {pos, buf} = data
      while pos < buf.length and i < buffer.length
        err data, 'str', 'failed to match "' + s + '"' if (buf[pos]&mask) != buffer[i]
        i += 1
        pos += 1
      data.pos = pos

      if i == buffer.length
        return s

collector = (allow_empty) ->
  buffers = []
  length = 0
  (b) ->
    if not b
      if not allow_empty and length == 0
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

list_chars = do ->
  col = collector()
  col atom_chars()
  col list_wildcards()
  col resp_specials()
  b = col()
  col = null
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
  (arg) ->
    handler = null
    (data) ->
      if not handler
        c = data.buf[data.pos]
        handler = if map[c] then map[c](arg) else map[0](arg)
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
  sp_code = ' '.charCodeAt 0
  close_code = end_char.charCodeAt 0
  ->
    results = []
    handler = cb()
    check_done = !!allow_none
    i = 0
    sep = false
    (data) ->
      if check_done
        return results if data.buf[data.pos] == close_code
        check_done = false

      # HACK: Even though this is supposed to have no separator, Gmail's IMAP
      # sends addresses in a space separated list
      if sep and data.buf[data.pos] == sp_code
        sep = false
        data.pos += 1
        return if data.pos == data.buf.length

      sep = false
      result = handler data
      return if typeof result == 'undefined'
      sep = true
      results.push result
      handler = cb()
      check_done = true
      return



sep_list = (sep_char, none_char, cb) ->

  sepcode = sep_char.charCodeAt 0
  none_code = none_char and none_char.charCodeAt 0
  (arg) ->
    results = []
    handler = cb(arg)
    sep = true
    i = 0
    (data) ->
      i += 1
      if not results.length
        return [] if i == 1 and none_code and data.buf[data.pos] == none_code
        result = handler data
        return if typeof result == 'undefined'
        results.push result
        return

      if sep
        if data.buf[data.pos] != sepcode
          return results
        sep = false
        data.pos += 1
        handler = cb(arg)
        return

      result = handler data
      return if typeof result == 'undefined'
      results.push result
      sep = true
      return

space_list = (cb, none_char) ->
  sep_list ' ', none_char, cb

comma_list = (cb) ->
  sep_list ',', false, cb


opt = (c) ->
  starts_with c,
    -> (data) ->
      data.pos += 1
      c
    -> (data) ->
      ''

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
    data_cb = cb()
    (data) ->
      result = data_cb data
      if typeof result != 'undefined'
        return result.join ''


oneof = (strs, nomatch, insens) ->
  # TODO preconvert chars to buffers here
  ->
    matches = strs
    i = 0
    (data) ->
      for code in data.buf[data.pos...]
        matches = (s for s in matches when s[i].charCodeAt(0) == code)
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
  cb = collect_until -> (data) ->
    for code, i in data.buf[data.pos...]
      return i if code not in [dash,dot] and code not in nums and code not in upper and code not in lower

  onres cb, (result) ->
    result.toString 'ascii'

route = (routes, nomatch) ->
  key_cb = route_key()
  (arg) ->
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
          route_func = routes[key_str](arg)
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
  (arg) ->
    i = 0
    handler = parts[i](arg)
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
      handler = parts[i](arg)
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
    handler = cb(args...)
    (data) ->
      result = handler data
      return if typeof result == 'undefined'

      return res_cb result, args...

l = (data) ->
  console.log data.buf[data.pos...]
  console.log data.buf.toString('utf8', data.pos)

greeting = greeting()
response = response()









##################### Server Section ######################

command = ->
  copy = series([ sp(), seq_set(), sp(), mailbox() ], [1,3])
  fetch = series([ sp(), seq_set(), sp(), fetch_attributes() ], [1,3])
  search = series([ sp(), search_args() ], 1)
  store =  series([ sp(), seq_set(), sp(), store_att_flags() ], [1,3])

  cmd = route
    "CAPABILITY": null
    "LOGOUT": null
    "NOOP": null
    "APPEND": append_args()
    "CREATE": series([ sp(), mailbox() ], 1)
    "DELETE": series([ sp(), mailbox() ], 1)
    "EXAMINE": series([ sp(), mailbox() ], 1)
    "LIST": series([ sp(), mailbox(), sp(), list_mailbox() ], [1,3])
    "LSUB": series([ sp(), mailbox(), sp(), list_mailbox() ], [1,3])
    "RENAME": series([ sp(), mailbox(), sp(), mailbox() ], [1,3])
    "SELECT": series([ sp(), mailbox() ], 1)
    "STATUS": series([ sp(), mailbox(), sp(), paren_wrap(space_list(status_att())) ], [1,3])
    "SUBSCRIBE": series([ sp(), mailbox() ], 1)
    "UNSUBSCRIBE": series([ sp(), mailbox() ], 1)
    "LOGIN": series([ sp(), userid(), sp(), password() ], [1,3])
    "AUTHENTICATE": series([ sp(), auth_type() ], 1)
    "STARTTLS": null
    "CHECK": null
    "CLOSE": null
    "EXPUNGE": null
    "COPY": copy
    "FETCH": fetch
    "STORE": store
    "SEARCH": search
    "UID": series([ sp(), route({
      "COPY": copy
      "FETCH": fetch
      "SEARCH": search
      "STORE": store
    })], 1)

    "X": x_command()

  cb = series [
    tag()
    sp()
    cmd
    crlf()
  ]

  onres cb, (result) ->

    tag: result[0].toString()
    command: result[2][0].toString()
    args: result[2][1]


search_args = ->
  c = 'C'.charCodeAt 0
  h = 'H'.charCodeAt 0
  
  nocharset = space_list search_key()
  hascharset = series [
    str 'CHARSET', true
    sp()
    astring()
    sp()
    nocharset
  ], [0,2,4]

  ->
    i = 0
    handler = null
    (data) ->
      if not handler
        for code in data.buf[data.pos...]
          if i == 0 and code != c
            handler = nocharset()
            break
          else if i == 1 and code != h
            handler = nocharset()
            handler
              pos: 0
              buf: new Buffer 'C'
            break
          else if i == 2
            handler = hascharset()
            handler
              pos: 0
              buf: new Buffer 'CH'
            break
          i += 1
          data.pos += 1

      if handler
        handler data

date = ->
  starts_with '"', wrap('"', '"', date_text()), date_text()

flag_keyword = ->
  atom()

search_key = cache ->
  keys = route
    "ALL": null
    "ANSWERED": null
    "BCC": series [ sp(), astring() ], 1
    "BEFORE": series [ sp(), date() ], 1
    "BODY": series [ sp(), astring() ], 1
    "CC": series [ sp(), astring() ], 1
    "DELETED": null
    "FLAGGED": null
    "FROM": series [ sp(), astring() ], 1
    "KEYWORD": series [ sp(), flag_keyword() ], 1
    "NEW": null
    "OLD": null
    "ON": series [ sp(), date() ], 1
    "RECENT": null
    "SEEN": null
    "SINCE": series [ sp(), date() ], 1
    "SUBJECT": series [ sp(), astring() ], 1
    "TEXT": series [ sp(), astring() ], 1
    "TO": series [ sp(), astring() ], 1
    "UNANSWERED": null
    "UNDELETED": null
    "UNFLAGGED": null
    "UNKEYWORD": series [ sp(), flag_keyword() ], 1
    "UNSEEN": null
    "DRAFT": null
    "HEADER": series([ sp(), header_fld_name(), sp(), astring() ], [1,3])
    "LARGER": series [ sp(), number() ], 1
    "NOT": series [ sp(), search_key() ], 1
    "OR": series([ sp(), search_key(), sp(), search_key() ], [1,3])
    "SENTBEFORE": series [ sp(), date() ], 1
    "SENTON": series [ sp(), date() ], 1
    "SENTSINCE": series [ sp(), date() ], 1
    "SMALLER": series [ sp(), number() ], 1
    "UID": series [ sp(), seq_set() ], 1
    "UNDRAFT": null

  list = paren_wrap space_list search_key()
  num = seq_set()
  paren = '('.charCodeAt 0
  ->
    handler = null
    (data) ->
      if not handler
        if data.buf[data.pos] in [0x30..0x39]
          handler = num()
        else if data.buf[data.pos] == paren
          handler = list()
        else
          handler = keys()
      handler data

userid = ->
  astring()

password = ->
  astring()

auth_type = ->
  atom()

list_mailbox = ->
  lookup
    '"': string()
    "{": string()
    '': list_char_str()

store_att_flags = ->
  zip ['op', 'silent', null, 'flags'], series [
    oneof ['+FLAGS', '-FLAGS', 'FLAGS'], false, true
    ifset '.', str '.SILENT', true
    sp()
    starts_with '(', flag_list(), space_list(flag())
  ]

seq_set = ->
  comma_list seq_item()

seq_item = ->
  num = seq_num()
  cb = series [
    num
    ifset ':', series [ str(':'), num ], 1
  ]

  onres cb, (result) ->
    if not result[1]
      result.pop()
    result

seq_num = ->
  num = number true
  star = '*'.charCodeAt 0
  ->
    handler = null
    (data) ->
      if not handler
        if data.buf[data.pos] == star
          return data.buf[data.pos...data.pos+1]
        else
          handler = num()
      handler data

# TODO This doesn't QUITE conform because ALL FULL and FAST can be repeated
fetch_attributes = ->
  starts_with '(', paren_wrap(space_list(fetch_att())), fetch_att()
fetch_att = ->
  body_section = series [
    section()
    ifset '<', subsection()
  ]

  route
    "ALL": null
    "FULL": null
    "FAST": null
    "ENVELOPE": null
    "FLAGS": null
    "INTERNALDATE": null
    "RFC822": null
    "RFC822.HEADER": null
    "RFC822.TEXT": null
    "RFC822.SIZE": null
    "BODY": ifset '[', body_section
    "BODYSTRUCTURE": null
    "BODY.PEEK": body_section
    "UID": null

subsection = ->
  series [
    str '<'
    number()
    str '.'
    number(true)
    str '>'
  ]

append_args = ->
  series [
    sp()
    mailbox()
    sp()
    ifset '(', series [ flag_list(), sp() ], 1
    ifset '"', series [ date_time(), sp() ], 1
    literal_size()
  ], [1, 3, 4, 5]

x_command = ->

  ->
    (data) ->






command = command()



