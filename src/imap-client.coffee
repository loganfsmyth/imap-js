
{ImapParser}    = require './imap-parser'
{EventEmitter}  = require 'events'
imap_connection = require './imap-connection'
util            = require 'util'


# Define custom contants to represent the state of the client
# and provide a simple way to display that contant as a string
# for easier debugging.
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


### Helpers
#### defineCommand
#
# Takes all of the info for a command, and returns the actual command
# function that will be executed to add everything to the command queue.
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


#### getCommandTag
#
# Converts an integer into an IMAP command tag for use uniquely identifying
# commands and command responses.
#
# Make a list of all CHARs except atom-specials and '+',
# then looks in that list using integer arguments.
tagChars = (String.fromCharCode i for i in [0x20..0x7E] when String.fromCharCode(i) not in ['(', ')', '{', ' ', '\\', '"', '%', '*', '+', ']'])
getCommandTag = (count) ->
  len = tagChars.length
  tag = ''
  while count >= 1
    i = Math.floor count%len
    count /= len
    tag = tagChars[i] + tag
  return tag


### ImapClient class
#
#### Events
#
# * 'greeting'  
#   The 'greeting' event is triggered once the greeting has been received
#   from the server and starttls has optionally been executed.
#
# * 'error'  
#   The 'error' event is triggered if the greeting is not received after
#   the timeout period, or if there is a problem with the tls negotiation.
#
# * 'bye'  
#   The 'bye' event is triggered if the server forces a disconnect.
#
exports.ImapClient = class ImapClient extends EventEmitter

  #### ImapClient
  #
  ##### Arguments
  # * *host*      - The host to connect to.
  # * *port*      - The port to connect to.
  # * *security*  - The type of security to use. (null, 'tls', 'ssl')
  # * *options*   - Optional options for the TLS connection. See docs for starttls.
  # * *cb*        - Optional 'greeting' event handler. Format: `function() {}`
  #
  constructor: (host, port, security, options, cb) ->
    super()

    if typeof options == 'function'
      cb = options
      options = {}


    # Initialize all standard variables.
    @tag_counter = 1
    @responseCallbacks = {}
    @continuationQueue = []
    @state = STATE_ERROR
    @_prepareResponse()

    # Create the client connection.
    # If there is an error, the 'error' event will be triggered in order
    # to let the client user know that something failed.
    @stream = imap_connection.createClientConnection port: port, host: host, security: security, tlsoptions: options, timeout: 500, (err) =>
      @emit 'error', new Error err if err

    # When we receive data, pass it to the parser.
    @stream.on 'data', (d) => @_onData d

    # Set up the provided callback to run when a greeting message is received.
    @on 'greeting', cb if cb

    # Create a new ImapParser object starting in greeting parsing mode.
    # Then bind all of the parser events to ImapClient methods
    # to process incoming responses.
    @parser = new ImapParser ImapParser.GREETING
    @parser.onContinuation  = (resp) => @_processContinuation resp
    @parser.onUntagged      = (resp) => @_processUntagged resp
    @parser.onTagged        = (resp) => @_processTagged resp
    @parser.onGreeting      = (resp) =>

      # When a greeting is received, process which type of response it was.
      #
      # * A BYE response means that the server is going to disconnect immediately.
      #   This could be for instance because it is too overloaded to accept more.
      # * A PREAUTH response means that the connection is already authenticated,
      #   so it is unneccesary to use 'LOGIN' or 'AUTHENTICATE' commands to
      #   authenticate the current IMAP session.
      # * A OK response means that the connection was made properly, but
      #   the session is still unauthorized.
      #
      @state = switch resp.type
        when 'BYE'      then STATE_LOGOUT
        when 'PREAUTH'  then STATE_AUTH
        else STATE_UNAUTH

      if resp.type == 'BYE'
        @emit 'bye', resp.text
        return

      # For TLS, we need to run STARTTLS before before proceeding
      if security == 'tls'
        @starttls (err) =>
          if err
            @emit 'error', new Error "Failed to establish TLS connection"
          else
            @emit 'greeting'

      # If we got a greeting on a non-tls connection, it's all working
      else
        @emit 'greeting'


  _prepareResponse: ->
    @response = {}

  #### _onData
  #
  # Data callback when data is received from the network. It is
  # passed directly into the parser, which processes it.
  #
  ##### Arguments
  # * *data* - Data to be parsed.
  #
  _onData: (data) ->
    console.log 'Parsing --' + data.toString('utf8') + '--'
#    try
    @parser.execute data
#    catch e
#      console.log e

  _processTextCode: (response) -> 
    if response.textcode?.type == 'CAPABILITY'
      @response.capability = response.textcode.value
    if response.textcode
      (@response['textcodes'] ?= {})[response.textcode.type] =
        type: response.textcode.type
        value: response.textcode.value
        state: response.type
        text: response.text


  #### _processUntagged
  #
  # Response callback when an untagged '*' response is received from the
  # IMAP server. The response then needs to be parsed and aggregated for reading.
  #
  ##### Arguments
  # * *response* - The response object from the parser.
  #
  _processUntagged: (response) ->
    switch response.type
      when 'CAPABILITY'
        @response['capability'] = response.value
      when 'LIST'
        (@response['list'] ?= [])[response.mailbox] =
          path:   response.mailbox.split response.delim
          flags:  response['list-flags']
          delim:  response.delim
      when 'LSUB'
        (@response['lsub'] ?= [])[response.mailbox] =
          path:   response.mailbox.split response.delim
          flags:  response['list-flags']
          delim:  response.delim

      when 'STATUS'
        @response['status'] = response
      when 'EXPUNGE'
        (@response['expunge'] ?= []).push response.value
      when 'SEARCH'
        @response['search'] = response.value
      when 'FLAGS'
        @response['flags'] = response.value
      when 'EXISTS'
        @response['exists'] = response.value
      when 'RECENT'
        @response['recent'] = response.value
      when 'FETCH'
        (@response['fetch'] ?= {})[response.value] = response['msg-att']
      when 'OK', 'BAD', 'PREAUTH', 'BYE', 'NO'
        @_processTextCode response

  #### _processContinuation
  #
  # Response callback when a continuation '+' response is received from the IMAP
  # server. This response triggers the continuation handler of the last request,
  # which will return a response to be written, or nothing if the response is completed.
  #
  ##### Arguments
  # * *response* - The response object from the parser.
  #
  _processContinuation: (response) ->
    handler = @continuationQueue.shift()
    handler response, (result) =>
      if result
        @stream.write result + '\r\n'
        @continuationQueue.unshift handler




  #### _processTagged
  #
  # Response callback when a tagged response is received from the IMAP server.
  # This response triggers the response callback of whichever request is being
  # responded to.
  #
  ##### Arguments
  # * *response* - The response object from the parser
  #
  _processTagged: (response) ->
    @_processTextCode response

    @response.type = response.type
    @response.text = response.text

    @responseCallbacks[response.tag]?.call @, (if response.type != 'OK' then response.type else null), @response
    delete @responseCallbacks[response.tag]

    @_prepareResponse()



  #### Client Commands - Any State
  #
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


  #### Client Commands - Not Authenticated
  starttls: defineCommand
    state: STATE_UNAUTH,
    command: 'STARTTLS'
    response: (err, resp, cb) ->
      if err then return cb err, resp

      # Replace the current cryptostream with a cleartext version
      @stream = @stream.starttls (err) =>
        cb err

      # New stream, rebind data listener
      @stream.on 'data', (d) => @_onData d


  # @TODO
  authenticate: defineCommand
    state: STATE_UNAUTH,
    command: 'AUTHENTICATE',

  login: defineCommand
    state: STATE_UNAUTH,
    command: (user, pass) -> "LOGIN #{user} #{pass}"
    response: (err, resp, cb) ->
      if !err then @state = STATE_AUTH
      cb err, resp



  #### Client Commands - Authenticated
  #
  select: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "SELECT \"#{mailbox}\"",
    response: (err, resp, cb) ->
      if not err then @state = STATE_SELECT
      cb err, resp

  examine: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "EXAMINE \"#{mailbox}\"",

  create: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "CREATE \"#{mailbox}\"",

  delete: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "DELETE \"#{mailbox}\"",

  rename: defineCommand
    state: STATE_AUTH,
    command: (mailbox, newmailbox) -> "RENAME \"#{mailbox}\" \"#{newmailbox}\"",

  subscribe: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "SUBSCRIBE \"#{mailbox}\"",

  unsubscribe: defineCommand
    state: STATE_AUTH,
    command: (mailbox) -> "UNSUBSCRIBE \"#{mailbox}\"",

  list: defineCommand
    state: STATE_AUTH,
    command: (refname, mailbox) -> "LIST \"#{refname}\" \"#{mailbox}\"",

  lsub: defineCommand
    state: STATE_AUTH,
    command: (refname, mailbox) -> "LSUB \"#{refname}\" \"#{mailbox}\"",

  status: defineCommand
    state: STATE_AUTH,
    command: (mailbox, items) -> "STATUS \"#{mailbox}\" (#{items.join(' ')})",

  append: defineCommand
    state: STATE_AUTH,
    command: (mailbox, flags, datetime, message) -> "APPEND \"#{mailbox}\" (#{flags.join(' ')}) #{datetime}{#{(new Buffer message, 'utf8').length}}",
    continue: (resp, cb, arg..., message) -> cb message




  #### Client Commands - Selected
  check: defineCommand
    state: STATE_SELECT,
    command: "CHECK",

  close: defineCommand
    state: STATE_SELECT,
    command: "CLOSE",

  expunge: defineCommand
    state: STATE_SELECT,
    command: "EXPUNGE",

  search: defineCommand
    state: STATE_SELECT,
    command: (charset, criteria, uid) -> (if uid then 'UID ' else '') + "SEARCH #{"CHARSET " + charset if charset } #{criteria}",

  fetch: defineCommand
    state: STATE_SELECT,
    command: (seqset, item_names, uid) -> (if uid then 'UID ' else '') + "FETCH #{seqset} #{item_names}",

  store: defineCommand
    state: STATE_SELECT,
    command: (seqset, action, flags, uid) ->
      act = switch action
        when 'add' then '+FLAGS'
        when 'set' then 'FLAGS'
        when 'remove' then '-FLAGS'

      (if uid then 'UID ' else '') + "STORE #{seqset} #{action} (#{flags.join(' ')})"

  copy: defineCommand
    state: STATE_SELECT,
    command: (seqset, mailbox, uid) -> (if uid then 'UID ' else '') + "COPY #{seqset} \"#{mailbox}\"",


  #### in
  #
  ##### Arguments
  #
  # * *user*      -
  # * *password*  -
  # * *cb*        -
  #
  in: (user, password, cb) ->
    @login user, password, cb


  #### out
  #
  ##### Arguments
  #
  # * *cb*
  #
  out: (cb) ->
    @logout cb


  #### auth
  #
  ##### Arguments
  #
  # * *mechanism* - 
  #
  auth: (mechanism) ->
    
  #### caps
  #
  ##### Arguments
  #
  # * *cb* - 
  #
  caps: (cb) ->
    

  #### boxes
  #
  ##### Arguments
  #
  # * *options*
  #     * *unread* - 
  # * *cb*
  boxes: ({unread}, cb)->
    




