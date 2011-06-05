
ipn     = require './imap_parser_native'
util    = require 'util'
{Iconv} = require 'iconv'

utf7to8 = new Iconv 'UTF-7', 'UTF-8'


ImapParser = class exports.ImapParser
  constructor: (type) ->
    @parser = new (ipn.ImapParser) type
    @reinitialize(type)

    @parser.onData = (b, start, len, type) => @onParserData b, start, len, type
    @parser.onStart = (type) => @onParserStart type
    @parser.onDone = (type) => @onParserDone type

  reinitialize: (type) ->
    @buffers = []
    @buffer_length = 0
    @values = []
    @parser.reinitialize(type)

  execute: (b) ->
    @parser.execute b, 0, b.length

  _modifiedUtf7ToUtf8: (data) ->
    result = ''
    start = -1
    for i in [0..data.length]
      if data[i] == '-'
        if start >= 0
          if i-start == 0
            result += '&'
          else
            result += utf7To8.convert data.slice(start, i+1).replace('&', '+').replace(',', '/')
          start = -1
        else
          result += '-'
      else if start >= 0

      else if data[i] == '&'
        start = i
      else
        result += data[i]
    return result

  onParserStart: (type) ->
    if type in [ ipn.IMAP_COMMAND_RESPONSE, ipn.IMAP_GREETING_RESPONSE, ipn.IMAP_UNTAGGED_RESPONSE, ipn.IMAP_CONTINUE_RESPONSE, ipn.IMAP_TAGGED_RESPONSE, ipn.IMAP_LIST, ipn.IMAP_RESP_TEXT, ipn.IMAP_MSG_ATT, ipn.IMAP_BODY, ipn.IMAP_ENVELOPE, ipn.IMAP_ADDRESS, ipn.IMAP_SECTION, ipn.IMAP_KEYVALUE]
      @values.push []


  onParserDone: (type) ->
    v = @values.pop()
    o = []
    switch type
#    when ipn.IMAP_COMMAND_RESPONSE
      when ipn.IMAP_GREETING_RESPONSE
        @onGreeting? @zip(['type', 'text'], v)
      when ipn.IMAP_UNTAGGED_RESPONSE
        o = switch v[0]
          when 'OK', 'BYE', 'BAD', 'NO'
            ['type', 'text']
          when 'CAPABILITY', 'FLAGS'
            ['type', 'value']
          when 'LIST', 'LSUB'
            ['type', 'list-flags', 'delim', 'mailbox']
            v[3] = @_modifiedUtf7ToUtf8 v[3]
          when 'SEARCH'
            if v.length > 1 then ['type', 'value'] else ['type']
          when 'STATUS'
            ['type', 'mailbox', 'attrs']
          else
            if v[1] == 'FETCH' then ['value', 'type', 'msg-att'] else ['value', 'type']
        @onUntagged? @zip o, v

      when ipn.IMAP_CONTINUE_RESPONSE
        o = if Buffer.isBuffer v[0] then ['base64'] else ['text']
        @onContinuation? @zip o, v

      when ipn.IMAP_TAGGED_RESPONSE
        @onTagged? @zip ['tag', 'type', 'text'], v

      when ipn.IMAP_LIST
        @values[@values.length-1].push v

      when ipn.IMAP_KEYVALUE
        kv = {}
        for i in [0...v.length] by 2
          kv[v[i]] = v[i+1]

        @values[@values.length-1].push kv

      when ipn.IMAP_RESP_TEXT
        o = [ 'text' ]
        if typeof v[0] == 'object'
          v[0] = @zip [ 'type', 'value' ], v[0]
          o.unshift('code')
        @values[@values.length-1].push @zip o, v

      when ipn.IMAP_MSG_ATT
        if v[0] == 'BODY' && v.length > 2
          o = ['name', 'section']
          if v.length > 3
            o.push 'number'
          o.push 'value'
        else if v[0] in ['BODY', 'RFC822', 'RFC822.HEADER', 'RFC822.TEXT', 'RFC822.SIZE', 'ENVELOPE', 'FLAGS', 'INTERNALEDATE', 'UID', 'BODYSTRUCTURE']
          o = ['name', 'value']

        @values[@values.length-1].push @zip o, v

      when ipn.IMAP_BODY
        if typeof v[0] == 'string'
          o = [ 'type', 'subtype', 'fld-param', 'fld-id', 'fld-desc', 'fld-enc', 'fld-octets' ]
          if v[0] == 'MESSAGE' && v[1] == 'RFC822'
            o = o.concat [ 'envelope', 'body', 'fld-lines' ]
          else if v[0] == 'TEXT'
            o.push 'fld-lines'

          if v.length > o.length
            o = o.concat ['fld-md5', 'fld-dsp', 'fld-lang', 'fld-loc', 'body-extensions']
        else
          o = [ 'bodies', 'subtype' ]
          if  v.length > 2
            o = o.concat ['fld-param', 'fld-dsp', 'fld-lang', 'fld-loc', 'body-extensions']

        @values[@values.length-1].push @zip o, v

      when ipn.IMAP_ENVELOPE
        o = ['date', 'subject', 'from', 'sender', 'reply-to', 'to', 'cc', 'bcc', 'in-reply-to', 'message-id']
        @values[@values.length-1].push @zip o, v

      when ipn.IMAP_ADDRESS
        o = ['name', 'adl', 'mailbox', 'host']
        @values[@values.length-1].push @zip o, v

      when ipn.IMAP_SECTION
        section = v.pop()
        if typeof section == 'object'
          sec =
            spec: v.join('.'),
            headers: section,
        else
          v.push section
          sec =
            spec: v.join('.'),
        @values[@values.length-1].push(sec)

  zip: (keys, vals) ->
    o = {}
    vl = vals.length
    for i in [0...keys.length]
      if typeof keys[i] != 'undefined' && i < vl
        o[keys[i]] = vals[i]
    return o


  onParserData: (b, start, len, type) ->
    if type == ipn.IMAP_NONE
      @buffers.push
        buf: b,
        start: start,
        len: len,
      @buffer_length += len
      return

    if @buffers.length > 0
      data = new Buffer @buffer_length + len
      pos = 0
      for info in @buffers
        info.buf.copy data, info.start, info.start + info.len
        pos += info.len
      if len > 0
        b.copy data, pos, start, start + len
      @buffers = []
      @buffer_length = 0
    else
      data = b.slice start, start + len

    if type == ipn.IMAP_LITERAL_SIZE
      return

    value = ''
    switch type
      when ipn.IMAP_ATOM, ipn.IMAP_LITERAL, ipn.IMAP_ASTRING, ipn.IMAP_TEXT
        value = data.toString 'utf8'
      when ipn.IMAP_QUOTED
        value = data.toString('utf8').replace('\\\\', '\\').replace('\\"', '"')
      when ipn.IMAP_NUMBER
        value = parseInt data.toString('utf8'), 10
      when ipn.IMAP_TEXT_OR_BASE64
        value = data.toString 'utf8'
        if not value.match /\=[^\=$]|\=\=\=$/
          value = new Buffer value, 'base64'
      when ipn.IMAP_BASE64
        value = new Buffer data.toString('utf8'), 'base64'
      when ipn.IMAP_DATETIME
        value = new Date data.toString 'ascii'
      when ipn.IMAP_NIL
        value = null
      else
        throw new Error "Unexpected datatype encountered: #{type}"

    @values[@values.length-1].push value


for i in ['GREETING', 'RESPONSE', 'COMMAND']
  ImapParser[i] = ipn['PARSER_' + i]

