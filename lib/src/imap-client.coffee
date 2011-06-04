
{ImapParser}    = require './imap-parser'
{EventEmitter}  = require 'events'
util            = require 'util'
tls             = require 'tls'
net             = require 'net'

STATE_ERROR   = 0x0
STATE_UNAUTH  = 0x1
STATE_AUTH    = 0x2
STATE_SELECT  = 0x4
STATE_LOGOUT  = 0x8


defineCommand = (state, {command: command_cb, response: response_cb, continue: continue_cb}) ->
  states = [STATE_ERROR, STATE_LOGOUT, STATE_UNAUTH, STATE_AUTH, STATE_SELECT]
  return (args..., cb) ->
    if states.indexOf(state) > states.indexOf(@state)
      stateName = stateStr(state)
      cb.call @, new Error "This command is not available in the #{stateName} state."
      return

    tag = getCommandTag @tag_counter++
    @responseCallbacks[tag] = if not response_cb then cb else (resp_args...)->
      response_cb.call @, resp_args..., cb

    if continue_cb
      @continuationQueue.push (cont_args...) ->
        continue_cb.call @, cont_args..., args...

    command = if typeof command_cb == 'function' then command_cb.apply(@, args) else command_cb
    @con.write tag + ' ' + command + '\r\n'

    console.log command



ImapClient = exports.ImapClient = (host, port, secure, cb) ->
  EventEmitter.call(this)

  @tag_counter = 1
  @responseCallbacks = {}
  @continuationQueue = []
  @untagged = {}
  @state = STATE_ERROR

  @parser = new ImapParser ImapParser.GREETING

  @parser.onContinuation  = (resp) => @_processContinuation resp
  @parser.onUntagged      = (resp) => @_processUntagged resp
  @parser.onTagged        = (resp) => @_processTagged resp

  if secure == 'ssl'
    @con = tls.connect port, host
  else
    @con = net.createConnection port, host
    @con.setKeepAlive true  # @TODO Needed?

  @con.on 'connect', => @emit 'connect'
  @con.on 'data', (d) =>
    console.log 'Parsing --' + d.toString('utf8') + '--'
    try
      @parser.execute d
    catch e
      console.log e


  @parser.onGreeting = (resp) =>
    @state = switch resp.type
      when 'BYE'      then STATE_LOGOUT
      when 'PREAUTH'  then STATE_AUTH
      else STATE_UNAUTH
    @_processUntagged resp

    if secure == 'tls'
      @starttls cb
    else
      process.nextTick cb

  return


util.inherits ImapClient, EventEmitter

ImapClient.prototype.STATE_ERROR    = STATE_ERROR
ImapClient.prototype.STATE_UNAUTH   = STATE_UNAUTH
ImapClient.prototype.STATE_AUTH     = STATE_AUTH
ImapClient.prototype.STATE_SELECT   = STATE_SELECT
ImapClient.prototype.STATE_LOGOUT   = STATE_LOGOUT




ImapClient.prototype._processUntagged = (response) ->
  switch response.type
    when 'CAPABILITY'
      (@untagged['capability'] ?= []).push response.value
    when 'LIST'
      (@untagged['list'] ?= [])[response.mailbox] =
        path:   response.mailbox.split response.delim
        flags:  response['list-flags']
    when 'LSUB'
      @untagged['lsub'] = ''
#    when 'STATUS', 'EXPUNGE', 'FETCH', 'SEARCH'
    when 'FLAGS'
      @untagged['flags'] = response.value
    when 'EXISTS'
      @untagged['exists'] = response.value
    when 'RECENT'
      @untagged['recent'] = response.value
    when 'BYE'
      @untagged['bye'] = response.text.text

ImapClient.prototype._processContinuation = (response) ->
  handler = @continuationQueue.shift()
  handler response, (result) =>
    if result
      @con.write result + '\r\n'
      @continuationQueue.unshift handler


ImapClient.prototype._processTagged = (response) ->
  console.log(response)
  console.log @responseCallbacks
  @responseCallbacks[response.tag]?.call @, (if response.type != 'OK' then response.type else null), response.text
  delete @responseCallbacks[response.tag]
  @untagged = {}



###
Client Commands - Any State
###
ImapClient.prototype.capability = defineCommand STATE_UNAUTH,
  command: 'CAPABILITY',

ImapClient.prototype.noop = defineCommand STATE_UNAUTH,
  command: 'NOOP',

ImapClient.prototype.logout = defineCommand STATE_UNAUTH,
  command: 'LOGOUT',
  response: (err, resp, cb) ->
    if err then @state = STATE_LOGOUT
    cb err, resp



###
Client Commands - Not Authenticated
###
ImapClient.prototype.starttls = defineCommand STATE_UNAUTH,
  command: 'STARTTLS'
  response: (err, resp, cb) ->
    if err then return cb err, resp

    pair = new tls.createSecurePair()
    listeners = @con.listeners 'data'
    @con.removeAllListeners('data')
    @con = pipe(pair, @con)
    (@con.on 'data', f for f in listeners)

    pair.on 'secure', -> cb err, resp

# @TODO
ImapClient.prototype.authenticate = defineCommand STATE_UNAUTH,
  command: 'AUTHENTICATE',
  response: (err, resp, cb) ->

ImapClient.prototype.login = defineCommand STATE_UNAUTH,
  command: (user, pass) -> "LOGIN #{user} #{pass}"
  response: (err, resp, cb) ->
    if !err then @state = STATE_AUTH
    cb err, resp






###
Client Commands - Authenticated
###
ImapClient.prototype.select = defineCommand STATE_AUTH,
  command: (mailbox) -> "SELECT #{mailbox}",
  response: (err, resp, cb) ->
    if err then @state = STATE_SELECT
    cb err, resp

ImapClient.prototype.examine = defineCommand STATE_AUTH,
  command: (mailbox) -> "EXAMINE #{mailbox}",

ImapClient.prototype.create = defineCommand STATE_AUTH,
  command: (mailbox) -> "CREATE #{mailbox}",

ImapClient.prototype.delete = defineCommand STATE_AUTH,
  command: (mailbox) -> "DELETE #{mailbox}",

ImapClient.prototype.rename = defineCommand STATE_AUTH,
  command: (mailbox, newmailbox) -> "RENAME #{mailbox} #{newmailbox}",

ImapClient.prototype.subscribe = defineCommand STATE_AUTH,
  command: (mailbox) -> "SUBSCRIBE #{mailbox}",

ImapClient.prototype.unsubscribe = defineCommand STATE_AUTH,
  command: (mailbox) -> "UNSUBSCRIBE #{mailbox}",

ImapClient.prototype.list = defineCommand STATE_AUTH,
  command: (refname, mailbox) -> "LIST #{refname} #{mailbox}",

ImapClient.prototype.lsub = defineCommand STATE_AUTH,
  command: (refname, mailbox) -> "LSUB #{refname} #{mailbox}",

ImapClient.prototype.status = defineCommand STATE_AUTH,
  command: (mailbox, items) -> "STATUS #{mailbox} (#{items.join(' ')})",

ImapClient.prototype.append = defineCommand STATE_AUTH,
  command: (mailbox, flags, datetime, message) -> "APPEND #{mailbox} (#{flags.join(' ')}) #{datetime}{#{(new Buffer message, 'utf8').length}}",
  continue: (resp, cb, arg..., message) -> cb message




###
Client Commands Selected
###
ImapClient.prototype.check = defineCommand STATE_AUTH,
  command: "CHECK",

ImapClient.prototype.close = defineCommand STATE_AUTH,
  command: "CLOSE",

ImapClient.prototype.expunge = defineCommand STATE_AUTH,
  command: "EXPUNGE",

ImapClient.prototype.search = defineCommand STATE_AUTH,
  command: (charset, criteria) -> "SEARCH #{charset} #{criteria}",

ImapClient.prototype.fetch = defineCommand STATE_AUTH,
  command: (seqset, item_names) -> "FETCH #{seqset} #{item_names}",

ImapClient.prototype.store = defineCommand STATE_AUTH,
  command: (seqset, item_name, value) -> "STORE #{seqset} #{item_name} #{value}",

ImapClient.prototype.copy = defineCommand STATE_AUTH,
  command: (seqset, mailbox) -> "COPY #{seqset} #{mailbox}",

ImapClient.prototype.uid = defineCommand STATE_AUTH,
  command: (command, args...) -> "UID #{command} #{args.join(' ')}",



# Make a list of all CHARs except atom-specials and '+'
tagChars = (String.fromCharCode i for i in [0x20..0x7E] when String.fromCharCode(i) not in ['(', ')', '{', ' ', '\\', '"', '%', '*', '+', ']'])

getCommandTag = (count) ->
  len = tagChars.length
  tag = ''
  while count >= 1
    i = Math.floor count%len
    count /= len
    tag = tagChars[i] + tag
  return tag


pipe = (pair, socket) ->
  pair.encrypted.pipe socket
  socket.pipe pair.encrypted
  pair.fd = socket.fd
  cleartext = pair.cleartext
  cleartext.socket = socket
  cleartext.encrypted = pair.encrypted
  cleartext.authorized = false

  onerror = (e) -> if cleartext._controlRelease then cleartext.emit 'error', e
  onclose = ->
    socket.removeListener 'error', onerror
    socket.removeListener 'close', onclose

  socket.on 'error', onerror
  socket.on 'close', onclose

  return cleartext

