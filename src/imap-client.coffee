
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

stateStr = (state) ->
  switch state
    when STATE_ERROR  then "Error"
    when STATE_UNAUTH then "Unauth"
    when STATE_AUTH   then "Auth"
    when STATE_SELECT then "Select"
    when STATE_LOGOUT then "Logout"

defineCommand = ({state: state, command: command_cb, response: response_cb, continue: continue_cb}) ->
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
    @stream.write tag + ' ' + command + '\r\n'

    console.log command



exports.ImapClient = class ImapClient extends EventEmitter
  constructor: (host, port, secure, options, cb) ->
    super()

    if typeof options == 'function'
      cb = options
      options = {}

    timeout = options.timeout || 500

    greeted = false

    @tag_counter = 1
    @responseCallbacks = {}
    @continuationQueue = []
    @untagged = {}
    @state = STATE_ERROR

    # For SSL immediately open an SSL/TLS connection
    if secure == 'ssl'
      @stream = tls.connect port, host, () =>
        cb true if not @stream.authorized
      @socket = @stream.socket

    # For TLS and unsecure, we start with a standard connection
    else
      @stream = @socket = net.createConnection port, host


    # When we receive data, pass it to the parser
    @stream.on 'data', (d) => @_onData d

    # On timeout, it it happens before greeting
    # Then initialization failed so run cb w/ error
    @socket.setTimeout timeout, =>
      cb true if not greeted
      @emit 'timeout'

    # Pass connect to our listeners
    @socket.setKeepAlive true  # @TODO Needed?
    @socket.on 'connect', => @emit 'connect'


    @parser = new ImapParser ImapParser.GREETING
    @parser.onContinuation  = (resp) => @_processContinuation resp
    @parser.onUntagged      = (resp) => @_processUntagged resp
    @parser.onTagged        = (resp) => @_processTagged resp
    @parser.onGreeting = (resp) =>

      greeted = true # stops timeout from triggering cb

      @state = switch resp.type
        when 'BYE'      then STATE_LOGOUT
        when 'PREAUTH'  then STATE_AUTH
        else STATE_UNAUTH
      @_processUntagged resp

      # For TLS, we need to run STARTTLS before before proceeding
      if secure == 'tls'
        @starttls cb

      # If we got a greeting on a non-tls connection, it's all working
      else
        process.nextTick cb

  STATE_ERROR:  STATE_ERROR,
  STATE_UNAUTH: STATE_UNAUTH,
  STATE_AUTH:   STATE_AUTH,
  STATE_SELECT: STATE_SELECT,
  STATE_LOGOUT: STATE_LOGOUT,

  _onData: (d) ->
    console.log 'Parsing --' + d.toString('utf8') + '--'
    try
      @parser.execute d
    catch e
      console.log e

  _processUntagged: (response) ->
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

  _processContinuation: (response) ->
    handler = @continuationQueue.shift()
    handler response, (result) =>
      if result
        @stream.write result + '\r\n'
        @continuationQueue.unshift handler


  _processTagged: (response) ->
    console.log(response)
    console.log @responseCallbacks
    @responseCallbacks[response.tag]?.call @, (if response.type != 'OK' then response.type else null), response.text
    delete @responseCallbacks[response.tag]
    @untagged = {}



  ###
  Client Commands - Any State
  ###
  capability: defineCommand
    state: STATE_UNAUTH,
    command: 'CAPABILITY',

  noop: defineCommand
    state: STATE_UNAUTH,
    command: 'NOOP',

  logout: defineCommand
    state: STATE_UNAUTH,
    command: 'LOGOUT',
    response: (err, resp, cb) ->
      if err then @state = STATE_LOGOUT
      cb err, resp


  ###
  Client Commands - Not Authenticated
  ###
  starttls: defineCommand
    state: STATE_UNAUTH,
    command: 'STARTTLS'
    response: (err, resp, cb) ->
      if err then return cb err, resp

      pair = new tls.createSecurePair()

      listeners = @stream.listeners 'data'
      @stream.removeAllListeners('data')
      @stream = pipe pair, @stream
      (@stream.on 'data', f for f in listeners)

      @socket = @stream.socket

      pair.on 'secure', -> cb err, resp

  # @TODO
  authenticate: defineCommand
    state: STATE_UNAUTH,
    command: 'AUTHENTICATE',
    response: (err, resp, cb) ->

  login: defineCommand
    state: STATE_UNAUTH,
    command: (user, pass) -> "LOGIN #{user} #{pass}"
    response: (err, resp, cb) ->
      if !err then @state = STATE_AUTH
      cb err, resp



  ###
  Client Commands - Authenticated
  ###
  select: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "SELECT #{mailbox}",
    response: (err, resp, cb) ->
      if err then @state = STATE_SELECT
      cb err, resp

  examine: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "EXAMINE #{mailbox}",

  create: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "CREATE #{mailbox}",

  delete: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "DELETE #{mailbox}",

  rename: defineCommand
    state: STATE_AUTH,
    command: (mailbox, newmailbox) -> "RENAME #{mailbox} #{newmailbox}",

  subscribe: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "SUBSCRIBE #{mailbox}",

  unsubscribe: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "UNSUBSCRIBE #{mailbox}",

  list: defineCommand
    state: STATE_AUTH,
    command: (refname, mailbox) -> "LIST #{refname} #{mailbox}",

  lsub: defineCommand
    state: STATE_AUTH,
    command: (refname, mailbox) -> "LSUB #{refname} #{mailbox}",

  status: defineCommand
    state: STATE_AUTH,
    command: (mailbox, items) -> "STATUS #{mailbox} (#{items.join(' ')})",

  append: defineCommand
    state: STATE_AUTH,
    command: (mailbox, flags, datetime, message) -> "APPEND #{mailbox} (#{flags.join(' ')}) #{datetime}{#{(new Buffer message, 'utf8').length}}",
    continue: (resp, cb, arg..., message) -> cb message




  ###
  Client Commands Selected
  ###
  check: defineCommand
    state: STATE_AUTH,
    command: "CHECK",

  close: defineCommand
    state: STATE_AUTH,
    command: "CLOSE",

  expunge: defineCommand
    state: STATE_AUTH,
    command: "EXPUNGE",

  search: defineCommand
    state: STATE_AUTH,
    command: (charset, criteria) -> "SEARCH #{charset} #{criteria}",

  fetch: defineCommand
    state: STATE_AUTH,
    command: (seqset, item_names) -> "FETCH #{seqset} #{item_names}",

  store: defineCommand
    state: STATE_AUTH,
    command: (seqset, item_name, value) -> "STORE #{seqset} #{item_name} #{value}",

  copy: defineCommand
    state: STATE_AUTH,
    command: (seqset, mailbox) -> "COPY #{seqset} #{mailbox}",

  uid: defineCommand
    state: STATE_AUTH,
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

