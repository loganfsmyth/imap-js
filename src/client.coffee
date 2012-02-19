#
# imap-js - Copyright (c) 2011 Logan Falconer Smyth
#
# Dual licensed under MIT and GPL licenses.
# See MIT-LICENSE.txt and GPL-LICENSE.txt

{EventEmitter} = require 'events'
util = require 'util'


p = (resp) ->
  for own i of resp
    if Buffer.isBuffer resp[i]
      resp[i] = resp[i].toString 'utf8'
    else if typeof resp[i] == 'object'
      p resp[i]
  return resp


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

    @_respCallbacks = {}
    @_contQueue = []
    options.host ?= 'localhost'
    options.security ?= 'none'
    @_security = options.security
    @_con = options.stream || constream.createConnection options.port, options.host, options.security == 'ssl'
    
    @_parser = parser.createParser parser.CLIENT
    @_con.on 'data', (c) -> console.log c.toString 'utf8'

    @_con.on 'connect', =>
      @_con.pipe @_parser

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

    @_respCallbacks[t] err, resp

  _onUntagged: (resp) ->
    console.log util.inspect p(resp), false, 20, true
    
  
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
      @_respCallbacks[t] = if not response then cb else (err, resp) => response.call @, err, resp, cb
      if cont
        @_contQueue.push =>
          cont args..., (err, buffer) =>
            if buffer and not err
              console.log 'writing ' + buffer.length + ' bytes'
              @_con.write buffer
            else
              @_con.write "\r\n", 'ascii'
      return

  capability: cmd
    command: 'CAPABILITY'

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

  login: cmd
    command: (user,pass) -> "LOGIN #{q user} #{q pass}"

  select: cmd
    command: (mailbox) -> "SELECT #{q mailbox}"

  examine: cmd
    command: (mailbox) -> "EXAMINE #{q mailbox}"

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

  lsub: cmd
    command: (name, mailbox) -> "LSUB #{q name} #{q mailbox}"

  status: cmd
    command: (mailbox, item_names) -> "STATUS #{q mailbox} (#{item_names.join ' '})"

  _dateToDatetime: (d) ->
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

  append: cmd
    command: (mailbox, flags, datetime, bytes) ->
      if !Array.isArray flags
        bytes = datetime
        datetime = flags
        flags = null
      if datetime not instanceof Date
        bytes = datetime
        datetime = null

      com = "APPEND #{q mailbox} "
      com += "(#{flags.join ' '}) " if flags
      com += '"' + @_dateToDatetime(datetime) + '" ' if datetime
      com += '{'
      if typeof bytes == 'string'
        com += Buffer.byteLength bytes
      else if Buffer.isBuffer bytes
        com += bytes.length
      com += '}'
      return com
    continue: (mailbox, flags, datetime, bytes, cb) ->
      if !Array.isArray flags
        cb = bytes
        bytes = datetime
        datetime = flags
        flags = null
      if datetime not instanceof Date
        cb = bytes
        bytes = datetime
        datetime = null
      cb null, bytes
      cb()

  check: cmd
    command: "CHECK"

  close: cmd
    command: "CLOSE"

  expunge: cmd
    command: "EXPUNGE"

  _searchCriteria: (crit) ->
    return crit

  search: cmd
    command: (crit) ->
      return 'SEARCH CHARSET UTF-8 ' + @_searchCriteria crit

  _fetchCriteria: (crit) ->
    return crit

  fetch: cmd
    command: (start, end, crit) ->
      if not crit
        crit = end
        end = null
      com = "FETCH " + start
      com += ':' + end if end
      com += ' ' + @_fetchCriteria crit

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

  copy: cmd
    command: (start, end, mailbox) ->
      if not mailbox
        mailbox = end
        end = null
      com = "COPY " + start
      com += ':' + end if end
      com += q mailbox
      return com

  uid: cmd












