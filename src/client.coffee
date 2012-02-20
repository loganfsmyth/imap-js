#
# imap-js - Copyright (c) 2011 Logan Falconer Smyth
#
# Dual licensed under MIT and GPL licenses.
# See MIT-LICENSE.txt and GPL-LICENSE.txt

{EventEmitter} = require 'events'
util = require 'util'

constream = require './imap-connection'
parser = require './async-parser'

module.exports = class Client extends EventEmitter
  tagCount = 0
  tag = ->
    return ''+tagCount

  cmd = (options) ->
    (args..., cb) -> @_handleCommand options, args, cb

  q = (str) ->
    '"' + str.replace(/(["\\])/g,"\\$1") + '"'

  @CommandError = class CommandError extends Error
    constructor: (resp) ->
      @name = "CommandError"
      @message = resp.text.toString()

  @CommandFailure = class CommandFailure extends Error
    constructor: (resp) ->
      @name = "CommandFailure"
      @message = resp.text.toString()

  @createClient = (options, cb) ->
    client = new Client options
    client.on 'connect', cb if cb
    return client

  constructor: (options) ->
    super()

    @_response = {}
    @_respCallbacks = {}
    @_contQueue = []
    options.host ?= 'localhost'
    options.security ?= 'none'
    @_security = options.security
    @_con = options.stream || constream.createConnection options.port, options.host, options.security == 'ssl'

    @_parser = parser.createParser parser.CLIENT
    #@_con.on 'data', (c) -> console.log c.toString 'utf8'

    @_con.on 'connect', =>
      @_con.pipe @_parser

#    @_parser.on 'body', (args...) ->
#      console.log util.inspect args, false, 20, true
#      console.log args[0].toString()

    connected = false
    @_parser.on 'greeting', (greeting) =>
      return if connected
      connected = true
      @_onGreeting greeting
    @_parser.on 'tagged', (args...) => @_onTagged args...
    @_parser.on 'untagged', (args...) => @_onUntagged args...
    @_parser.on 'continuation', (args...) => @_onContinuation args...

    @_con.on 'timeout', =>
      if not connected
        @emit 'connect', new Error 'Timeout error'
      else
        @emit 'close'

    @_con.on 'error', (e) => @emit 'error', e
    @_con.on 'close', (e) => @emit 'close', e
    @_con.on 'end', => @emit 'close'

    @emitEnabled options?.emit

  emitEnabled: (stat) ->
    @_parser.emitEnabled stat

  _onGreeting: (greeting) ->
    if @_security == 'tls'
      @starttls (e) =>
        @emit 'connect', e
    else
      @emit 'connect'
  _onTagged: (resp) ->
    t = resp.tag.toString 'ascii'

    if resp.type == 'BAD'
      err = new CommandError resp
    else if resp.type == 'NO'
      err = new CommandFailure resp

    @_onUntagged resp
    @_response.text = resp.text
    @_response.type = resp.type
    @_respCallbacks[t] err, @_response
    @_response = {}

  _onUntagged: (resp) ->
    type = resp.type.toUpperCase()
    switch type
      when "OK", "NO", "BAD", "BYE"
        code = resp['text-code']
        value =
          type: type
          text: resp.text
          key: code and code.key.toUpperCase()
          value: code and code.value
        if code
          @_response.state ?= {}
          @_response.state[value.key] = value
        @_response.bye = type == 'BYE'

      when "CAPABILITY"
        @_response.state ?= {}
        @_response.state['CAPABILITY'] = resp.value

      when "FLAGS"
        @_response.flags = resp.value
      when "LIST", "LSUB"
        (@_response[type.toLowerCase()] ?= []).push resp.value
      when "SEARCH"
        @_response.search = resp.value
      when "STATUS"
        val = resp.value
        @_response.status ?= {}
        @_response.status[val.mailbox] = val.attributes
      when "EXISTS"
        @_response.exists = resp.id
      when "RECENT"
        @_response.recent = resp.id

      when "EXPUNGE"
        @_response.expunge ?= []
        # TODO: Adjust these ids?
        @_response.expunge.push resp.value
      when "FETCH"
        @_response.fetch ?= {}
        @_response.fetch[resp.id] = resp.value
      else
        console.log "Unexpected response type: " + type

  _onContinuation: (resp) ->
    cb = @_contQueue.shift()
    if cb
      cb()
    else
      console.log 'wtf??'

  _handleCommand: ({command, response, continue: cont}, args, cb) ->
      t = tag()
      command = command.apply @, args if typeof command == 'function'
      command = t + ' ' + command + '\r\n'

      console.log command
      @_con.write command
      @_respCallbacks[t] = if not response
        (err, resp) -> cb err, null, resp
      else
        (err, resp) => response.call @, err, resp, cb
      if cont
        @_contQueue.push =>
          cont args..., (err, buffer) =>
            #console.log buffer?.toString()
            if buffer and not err
              @_con.write buffer
            else
              @_con.write "\r\n", 'ascii'
      return

  capability: cmd
    command: 'CAPABILITY'
    response: (err, resp, cb) ->
      cb err, resp.state?['CAPABILITY']

  noop: cmd
    command: 'NOOP'

  logout: cmd
    command: 'LOGOUT'
    response: (err, resp, cb) ->
      @_con.close() if not err

  starttls: cmd
    command: 'STARTTLS'
    response: (err, resp, cb) ->
      return cb err if err
      @_con.starttls (err) ->
        cb err, resp


  authenticate: cmd
    command: (mech) -> "AUTHENTICATE #{mech}"
    # TODO

  login: cmd
    command: (user,pass) -> "LOGIN #{q user} #{q pass}"

  select: cmd
    command: (mailbox) -> "SELECT #{q mailbox}"
    response: (err, resp, cb) ->
      cb err,
        flags: resp.flags
        exists: resp.exists
        recent: resp.recent
        # Need to check OK on these?
        unseen: resp.state['UNSEEN']?.value
        permanentflags: resp.state['PERMANENTFLAGS']?.value
        uidnext: resp.state['UIDNEXT']?.value
        uidvalidity: resp.state['UIDVALIDITY']?.value
      , resp

  examine: cmd
    command: (mailbox) -> "EXAMINE #{q mailbox}"
    response: (err, resp, cb) ->
      cb err,
        flags: resp.flags
        exists: resp.exists
        recent: resp.recent
        # Need to check OK on these?
        unseen: resp.state['UNSEEN']?.value
        permanentflags: resp.state['PERMANENTFLAGS']?.value
        uidnext: resp.state['UIDNEXT']?.value
        uidvalidity: resp.state['UIDVALIDITY']?.value
      , resp

  create: cmd
    command: (mailbox) -> "CREATE #{q mailbox}"

  delete: cmd
    command: (mailbox) -> "DELETE #{q mailbox}"

  rename: cmd
    command: (mailbox, newmailbox) -> "RENAME #{q mailbox} #{q newmailbox}"

  subscribe: cmd
    command: (mailbox) -> "SUBSCRIBE #{q mailbox}"

  unsubscribe: cmd
    command: (mailbox) -> "UNSUBSCRIBE #{q mailbox}"

  list: cmd
    command: (name, mailbox) -> "LIST #{q name} #{q mailbox}"
    response: (err, resp, cb) ->
      cb err, resp.list

  lsub: cmd
    command: (name, mailbox) -> "LSUB #{q name} #{q mailbox}"
    response: (err, resp, cb) ->
      cb err, resp.lsub

  status: cmd
    command: (mailbox, item_names) -> "STATUS #{q mailbox} (#{item_names.join ' '})"
    response: (err, resp, cb) ->
      cb err, resp.status

  append: cmd
    command: (mailbox, flags, datetime, bytes, stream) ->
      if !Array.isArray flags
        stream = bytes
        bytes = datetime
        datetime = flags
        flags = null
      if datetime not instanceof Date
        stream = bytes
        bytes = datetime
        datetime = null

      com = "APPEND #{q mailbox} "
      com += "(#{flags.join ' '}) " if flags
      com += '"' + dateToDatetime(datetime) + '" ' if datetime
      com += '{'
      if typeof bytes == 'string'
        com += Buffer.byteLength bytes
      else if Buffer.isBuffer bytes
        com += bytes.length
      else
        # Pause the stream to not emit until continuation
        stream.pause()
        com += bytes # Assume bytes is the number of bytes
      com += '}'
      return com
    continue: (mailbox, flags, datetime, bytes, stream, cb) ->
      if !Array.isArray flags
        cb = stream
        stream = bytes
        bytes = datetime
        datetime = flags
        flags = null
      if datetime not instanceof Date
        cb = stream
        stream = bytes
        bytes = datetime
        datetime = null
      
      if not cb
        cb = stream
        stream = null
      
      if stream
        stream.resume()
        stream.on 'data', (c) ->
          # TODO: Limit length to bytes
          cb null, c
        stream.on 'end', ->
          cb()

      else
        cb null, bytes
        cb()

  check: cmd
    command: "CHECK"

  close: cmd
    command: "CLOSE"

  expunge: cmd
    command: "EXPUNGE"
    response: (err, resp, cb) ->
      cb err, resp.expunge, resp

  _searchCriteria: (crit) ->
    return crit

  search: cmd
    command: (crit) ->
      return 'SEARCH CHARSET UTF-8 ' + @_searchCriteria crit
    response: (err, resp, cb) ->
      cb err, resp.search, resp

  _fetchCriteria: (crit) ->
    return crit

  fetch: cmd
    command: (seq, crit) ->
      if Array.isArray seq
        seq = seq.join ','
      seq = (''+seq).replace ' ', '' # No whitespace

      com = "FETCH " + seq
      com += ' ' + @_fetchCriteria crit
    response: (err, resp, cb) ->
      cb err, resp.fetch, resp

  store: cmd
    command: (start, end, op, flags) ->
      if not flags
        flags = op
        op = end
        end = null
      com = "STORE " + start
      com += ':' + end if end
      com += ' '
      com += switch op
        when 'add' then '+'
        when 'set' then ''
        when 'del' then '-'
      com += 'FLAGS '
      com += "(#{flags.join ' '})"
      return com
    response: (err, resp, cb) ->
      cb err, resp.fetch, resp

  copy: cmd
    command: (start, end, mailbox) ->
      if not mailbox
        mailbox = end
        end = null
      com = "COPY " + start
      com += ':' + end if end
      com += q mailbox
      return com

  #uid: cmd


# Format an RFC822 Datetime
dateToDatetime = (d) ->
  months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  com = ''
  com += '0' if d.getDate() < 10
  com += d.getDate() + '-'
  com += months[d.getMonth()] + '-'
  com += d.getFullYear() + ' '


  com += '0' if d.getHours() < 10
  com += d.getHours() + ':'
  com += '0' if d.getMinutes() < 10
  com += d.getMinutes() + ':'
  com += '0' if d.getSeconds() < 10
  com += d.getSeconds()

  com += ' '

  min = d.getTimezoneOffset()
  if min < 0
    com += '-'
    min *= -1
  else
    com += '+'
  hours = min/60
  min = min%60
  com += '0' if hours < 10
  com += hours
  com += '0' if min < 10
  com += min

  return com

