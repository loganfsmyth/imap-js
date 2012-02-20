#
# imap-js - Copyright (c) 2011 Logan Falconer Smyth
#
# Dual licensed under MIT and GPL licenses.
# See MIT-LICENSE.txt and GPL-LICENSE.txt

{EventEmitter} = require 'events'
util = require 'util'

constream = require './connection'
parser = require './parser'

module.exports = class Client extends EventEmitter
  tagChars = (String.fromCharCode i for i in [0x20..0x7E] when String.fromCharCode(i) not in ['(', ')', '{', ' ', '\\', '"', '%', '*', '+', ']'])
  tagCount = 1
  tag = ->
    count = tagCount++
    len = tagChars.length
    tagVal = ''
    while count >= 1
      i = Math.floor count%len
      count /= len
      tagVal = tagChars[i] + tagVal
    return tagVal

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


  # ## createClient(options, cb)
  #
  # * *options* - Options for the client.
  #   * *host* - The hostname to connect to. Default to localhost.
  #   * *port* - The port to connect to. Defaults based on security to 143 or 993.
  #   * *security* - 'none', 'tls', or 'ssl'. Defaults to 'none'.
  #   * *tlsoptions* - Options to pass to tls.connect for tls/ssl connection.
  #   * *stream* - Instead of creating a socket, use a pre-created ReadStream.
  # * *cb* - An optional callback to run once the connection is fully established.
  #
  # The primary entry point for the client. Creates a Client object and
  # automatically binds the given callback to the 'greeting' event.
  @createClient = (options, cb) ->
    if typeof options == 'function'
      cb = options
      options = null
    client = new Client options
    client.on 'connect', cb if cb
    return client

  # ## new Client(options)
  #
  # * See createClient for *options* documentation.
  constructor: (options) ->
    super()

    @_security = options.security
    @connected = false

    # Initialize empty response object, filled as data arrived.
    @_response = {}

    # Initialize response callback cache. Cached by request tag.
    @_respCallbacks = {}

    # Initialize continuation queue. If multiple requests with continuations are
    # sent, the server will respond in the order they were sent, so we queue the
    # callbacks so they are executed properly when the server responds.
    @_contQueue = []

    # To make testing easier, allow a stream to be passed in for simpler dummy testing.
    @_con = options.stream || constream.createConnection options

    # Generate the client parser and pipe all data from the stream into it.
    @_parser = parser.createParser parser.CLIENT
    @_con.pipe @_parser

    # Proxy all events from the parser to helper functions for processing.
    @_parser.on 'greeting',     (args...) => @_onGreeting args...
    @_parser.on 'tagged',       (args...) => @_onTagged args...
    @_parser.on 'untagged',     (args...) => @_onUntagged args...
    @_parser.on 'continuation', (args...) => @_onContinuation args...
    @_parser.on 'body',         (args...) => @_onBody args...

    # Listen to events on socket to pass along disconnect and such.
    @_con.on 'timeout', =>
      if not @connected
        @emit 'connect', new Error 'Timeout error'
      else
        @emit 'close'

    @_con.on 'error', (e) => @emit 'error', e
    @_con.on 'close', (e) => @emit 'close', e
    @_con.on 'end', => @emit 'close'

    @emitEnabled options?.emit

  # ## emitEnabled (stat)
  # * *stat* - Boolean indicating whether the parser should emit body responses
  #            or include them in the response object. (Optional)
  # Returns the emit status.
  #
  # See parser emitEnabled for more info.
  emitEnabled: (stat) ->
    @_parser.emitEnabled stat

  # ## _onGreeting(greeting)
  # * *greeting* - The greeting response object from the parser.
  #
  # When the greeting is received from the parser, the client will either emit
  # the 'connect' event immediately, or attempt a TLS negotiation and then emit,
  # depending on the type of security provided initially.
  _onGreeting: (greeting) ->
    return if @connected

    if @_security == 'tls'
      @starttls (e) =>
        @emit 'connect', e
    else
      @emit 'connect'

  # ## _onTagged(resp)
  # * *resp* - The response object from the parser.
  #
  # When a tagged response is received, it means that the request is complete. At
  # this point all untagged responses containing data will have been added to the
  # response object.
  _onTagged: (resp) ->
    t = resp.tag

    # If the response is BAD or NO, create an Error object to pass to the
    # callback function.
    if resp.type == 'BAD'
      err = new CommandError resp
    else if resp.type == 'NO'
      err = new CommandFailure resp

    # Pass response to untagged to process textcodes.
    @_onUntagged resp

    # Copy last few values to actual response
    @_response.text = resp.text
    @_response.type = resp.type

    # Reset response object before triggering callback
    resp = @_response
    @_response = {}

    # Trigger response callback based on the response tag and remove the handler.
    @_respCallbacks[t] err, resp
    delete @_respCallbacks[t]

  # ## _onUntagged(resp)
  # * *resp* - The response object from the parser.
  #
  # Process untagged respones, which contain the grand majority of response data
  # for standard requests. The data in the response is unpacked into the parser's
  # response object, which grows with each response until a final tagged response
  # arrives.
  _onUntagged: (resp) ->
    type = resp.type.toUpperCase()
    switch type
      when "OK", "NO", "BAD", "BYE"
        # Extract the text-code values from responses that have them.
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

      # Extract capability data into text-code value, to keep consistency with
      # values returned as untagged responses or as text-codes.
      when "CAPABILITY"
        @_response.state ?= {}
        @_response.state['CAPABILITY'] = resp.value

      when "FLAGS"
        @_response.flags = resp.value

      # Push list and lsub responses to lists, since responce is one mailbox.
      when "LIST", "LSUB"
        (@_response[type.toLowerCase()] ?= []).push resp.value
      when "SEARCH"
        @_response.search = resp.value

      # Index status responses by mailbox name, since several may arrive.
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
      
      # Index fetch responses by message id, which will either be a UID or id.
      when "FETCH"
        @_response.fetch ?= {}
        @_response.fetch[resp.id] = resp.value
      else
        console.log "Unexpected response type: " + type

  # ## _onContinuation(resp)
  # * *resp* - The response object from the parser
  #
  # Continuation responses arrive when a request is sent that involves literal
  # data type. These requests require a response from the server first as they may
  # be sending a large amount of data. Callbacks are queued because if several are
  # sent then the server will response in the order that they were originally
  # sent.
  _onContinuation: (resp) ->
    cb = @_contQueue.shift()
    if cb
      cb()
    else
      console.log 'wtf??'

  # ## _onBody(chunk, body, remaining, name)
  # * *chunk* - A Buffer containing data for this body response.
  # * *body* - Object containing id, section and partial data for the body.
  # * *remaining* - The number of bytes left to receive. When value is 0, all
  #                 data has been received. Will be null or 0 for quoted string.
  # * *name* - A random name assigned to thie body response. This name is 
  #            substituted in place of the response data in the final response
  #            object.
  #
  # One of the benefits of having a fully async parser is that no data needs to
  # be buffered between chunks in many cases. This helper runs when
  # 'emitEnabled' has been set true. The objective is that when the client is
  # downloading a large attachment, it is not necessary to cache it all in RAM
  # until the whole response has arrived.
  #
  # This is used to immediately forward the requested data to somewherever it
  # needs to go, without waiting for the full response.
  _onBody: (chunk, body, remaining, name) ->
    console.log arguments

  # ## \_handleCommand(options, args, cb)
  # * *options* - Object with command info
  #   * *command* - A string to send as a command, or a function to run to get
  #               the command string. Function is passed all arguments to the
  #               returned function.
  #   * *response* - The function to call when the request is complete. (optional)
  #                  Should take the form function(err, resp, cb) { } and call cb
  #                  when complete with arguments (err, command_response, resp).
  #   * *continue* - The function to call when a continuation response arrives.
  #                  Should take the form function(args..., cb) { } and call cb
  #                  with data to pass back to the server as (err, data, more).
  #                  Whe data is blank, request ends. 'more' will wait for another
  #                  continuation request to arrive for this same request.
  # * *args* - An array of arguments passed to the command. These are passed to
  #            'command' and 'continue' function for use.
  # * *cb* - The callback to run when the command is complete. Should take the
  #          form (err, command_response, resp).
  #
  _handleCommand: ({command, response, continue: cont}, args, cb) ->
      # Build the command string using tag, command str/func and final newline.
      t = tag()
      command = command.apply @, args if typeof command == 'function'
      command = t + ' ' + command + '\r\n'
      @_con.write command

      # Set response callback based on the tag. Default to standard callback,
      # but if a specific response callback is provided, then delegate to that
      # instead.
      @_respCallbacks[t] = if not response
        (err, resp) -> cb err, null, resp
      else
        (err, resp) => response.call @, err, resp, cb

      # Generate and queue a continuation callback if provided.
      if cont
        continue_cb = =>
          # Pass all original args to continue callback, and pass it a callback
          # that allows for outputting data and requeueing handler for more
          # incoming data.
          cont args..., (err, buffer, more) =>
            @_contQueue.unshift continue_cb if more
            
            # Write data and return result of write to allow 'pause' events.
            if buffer and not err
              @_con.write buffer
            else
              @_con.write "\r\n", 'ascii'

        @_contQueue.push continue_cb
      return

  capability: cmd
    command: 'CAPABILITY'
    response: (err, resp, cb) ->
      cb err, resp.state?['CAPABILITY'], resp

  noop: cmd
    command: 'NOOP'

  logout: cmd
    command: 'LOGOUT'
    response: (err, resp, cb) ->
      @_con.close() if not err
      cb err, null, resp

  starttls: cmd
    command: 'STARTTLS'
    response: (err, resp, cb) ->
      return cb err, null, resp if err
      @_con.starttls (err) ->
        cb err, null, resp


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
      cb err, resp.list, resp

  lsub: cmd
    command: (name, mailbox) -> "LSUB #{q name} #{q mailbox}"
    response: (err, resp, cb) ->
      cb err, resp.lsub, resp

  status: cmd
    command: (mailbox, item_names) -> "STATUS #{q mailbox} (#{item_names.join ' '})"
    response: (err, resp, cb) ->
      cb err, resp.status, resp

  append: cmd
    command: (mailbox, flags, datetime, bytes, stream) ->
      # Shift everything if no flags given
      if !Array.isArray flags
        stream = bytes
        bytes = datetime
        datetime = flags
        flags = null
      # Shift everything if no datetime given
      if datetime not instanceof Date
        stream = bytes
        bytes = datetime
        datetime = null

      # Pause the stream to not emit until continuation
      stream.pause() if stream

      # Build the command string from all arguments
      com = "APPEND #{q mailbox} "
      com += "(#{flags.join ' '}) " if flags
      com += '"' + dateToDatetime(datetime) + '" ' if datetime
      com += '{'
      com += if typeof bytes == 'string'
        Buffer.byteLength bytes
      else if Buffer.isBuffer bytes
        bytes.length
      else
        # Assume bytes is the number of bytes
        bytes
      com += '}'
      return com
    continue: (mailbox, flags, datetime, bytes, stream, cb) ->
      # Fix all arguments, just like in command
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
      
      # Fix cb if stream is not given
      if not cb
        cb = stream
        stream = null
      
      # If a stream was given, pipe the stream's data to the client.
      if stream
        # The stream was paused when it was passed as an argument, so resume now
        # that we can properly start writing the data to the server.
        stream.resume()
        stream.on 'data', (c) ->
          # TODO: Limit length to bytes
          # TODO: Catch return and do pause/drain
          cb null, c
        stream.on 'end', ->
          cb()

      else
        # Write data directly if no stream was given.
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


  # ### search
  # * *criteria*  - An array of search criteria.
  # * *charset*   - The charset to use. (Optional)
  # * *uid*       - Boolean indicating if results should be returned
  #                 as a uid instead of sequence number.
  #
  # Searches the current mailbox using the given criteria, returning a list of
  # ids for the matching messages.
  #
  # Criteria include:
  #
  # * A sequence set.
  # * ALL, ANSWERED, DELETED, DRAFT, FLAGGED, NEW, OLD, RECENT, SEEN, UNANSWERED
  # * UNDELETED, UNDRAFT, UNFLAGGED, UNSEEN
  # * BCC|FROM|CC|TO < email address >
  # * BEFORE|SENTBEFORE|SENTON|SENTSINCE|SINCE < rfc2822 date >
  # * BODY|TEXT|SUBJECT
  # * KEYWORD|UNKEYWORD < flag >
  # * UID < sequence set >
  # * LARGER|SMALLER < bytes >
  # * HEADER < field > < str >
  # * OR < crit 1 > < crit 2 >
  # * NOT < crit >
  #
  search: cmd
    command: (crit) -> 'SEARCH CHARSET UTF-8 ' + @_searchCriteria crit
    response: (err, resp, cb) ->
      cb err, resp.search, resp

  _searchCriteria: (crit) ->
    return crit


  # ### fetch
  # * *seqset*  - A sequence of messages to get.
  # * *items*   - A array of items to get for each message.
  #
  # Fetches data about a set of messages.
  #
  # Items include:
  #
  # * ALL  - FLAGS, INTERNALDATE, RFC822.SIZE, ENVELOPE
  # * FAST - FLAGS, INTERNALDATE, RFC822.SIZE
  # * FULL - FLAGS, INTERNALDATE, RFC822.SIZE, ENVELOPE, BODY
  # * BODY
  # * BODY[section]<partial>
  # * BODY.PEEK[section]<partial>
  # * BODYSTRUCTURE
  # * ENVELOPE
  # * FLAGS
  # * INTERNALDATE
  # * RFC822, RFC822.HEADER, RFC822.SIZE, RFC822.TEXT
  # * UID
  fetch: cmd
    command: (seq, crit) ->
      if Array.isArray seq
        seq = seq.join ','
      seq = (''+seq).replace ' ', '' # No whitespace

      com = "FETCH " + seq
      com += ' ' + @_fetchCriteria crit
    response: (err, resp, cb) ->
      cb err, resp.fetch, resp

  _fetchCriteria: (crit) ->
    return crit


  store: cmd
    command: (seq, op, flags) ->
      if Array.isArray seq
        seq = seq.join ','
      seq = (''+seq).replace ' ', '' # No whitespace

      com = "STORE " + seq + ' '
      com += switch op
        when 'add' then '+'
        when 'set' then ''
        when 'del' then '-'
      com += "FLAGS (#{flags.join ' '})"
      return com
    response: (err, resp, cb) ->
      cb err, resp.fetch, resp

  copy: cmd
    command: (seq, mailbox) ->
      if Array.isArray seq
        seq = seq.join ','
      seq = (''+seq).replace ' ', '' # No whitespace
      return "COPY " + seq + ' ' + q mailbox

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

