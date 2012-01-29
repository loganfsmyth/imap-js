#
# imap-js - Copyright (c) 2011 Logan Falconer Smyth
#
# Dual licensed under MIT and GPL licenses.
# See MIT-LICENSE.txt and GPL-LICENSE.txt

tls     = require 'tls'
net     = require 'net'
crypto  = require 'crypto'
Stream  = require 'stream'

module.exports = class ConnectionStream extends Stream
  @createConnection = (port, host, secure, cb) ->
    return new ConnectionStream port, host, secure, cb

  constructor: (port, host, @secure, cb) ->
    if @secure
      port ?= 993
      @_stream = tls.connect port, host, =>
        #stream.authorizationError if cb and not stream.authorized and not tlsoptions.allowUnauthorized
        @emit 'connect'
      @socket = @_stream.socket
    else
      port ?= 143
      @socket = @_stream = net.createConnection port, host, =>
        @emit 'connect'


    @_bindListeners()

  starttls: (options, cb) ->
    if @secure
      return process.nextTick cb

    if typeof options == 'function'
      cb = options
      options = null
    options ?= {}

    sslcontext = crypto.createCredentials options
    pair = tls.createSecurePair sslcontext, options.server, options.requestCert, options.rejectUnauthorized

    @_stream.removeListener 'data', @_boundListeners['data']
    @_stream = pipe pair, @socket
    @_stream.on 'data', @_boundListeners['data']

    pair.on 'secure', =>
      verifyError = pair.ssl.verifyError()

      @_stream.npnProtocol = pair.npnProtocol

      if verifyError
        @_stream.authorized = false
        @_stream.authorizationError = verifyError
      else
        @_stream.authorized = true

      @_stream.emit 'secureConnect'

    @_stream.on 'secureConnect', =>
      if not @_stream.authorized and not options.allowUnauthorized
        cb @_stream.authorizationError
      else
        cb

  _bindListeners: ->
    @_boundListeners = {}
    for e in ['data', 'end', 'error', 'close', 'drain', 'pipe']
      do (e) =>
        @_boundListeners[e] = (args...) => @emit e, args...
    @_stream.on e, cb for e, cb of @_boundListeners

  _unbindListeners: ->
    @_stream.removeListener e, cb for e, cb of @_boundListeners

  setEncoding: (enc) ->
    @_stream.setEncoding enc
  pause: ->
    @_stream.pause()
  resume: ->
    @_stream.resume()
  write: (buffer, enc) ->
    @_stream.write buffer, enc
  end: (buffer, enc) ->
    @_stream.end buffer, enc
  destroy: ->
    @_stream.destroy()
  destroySoon: ->
    @_stream.destroySoon()

ConnectionStream.prototype.__defineGetter__ 'writable', ->
  return @_stream.writable

ConnectionStream.prototype.__defineGetter__ 'readable', ->
  return @_stream.readable

#### pipe
# Standard pipe function very similar to the one used in node.js's tls.js
# file for making a cleartext stream from an encrypted stream.
#
# Takes a socket and a SecurePair argument and returns #
##### Arguments
# * *pair*   - A SecurePair object that will be managing the codec process
#              of the socket
# * *socket* - A socket that needs to be decoded.
#
##### Return 
# A cleartext stream that can be written to in order to
# transparently write encrypted data to the original socket.
#
pipe = (pair, socket) ->
  pair.encrypted.pipe socket
  socket.pipe pair.encrypted
  pair.fd = socket.fd
  cleartext = pair.cleartext
  cleartext.socket = socket
  cleartext.encrypted = pair.encrypted
  cleartext.authorized = false

  onerror = (e) -> 
    cleartext.emit 'error', e if cleartext._controlReleased
  onclose = ->
    socket.removeListener 'error', onerror
    socket.removeListener 'close', onclose
    socket.removeListener 'timeout', ontimeout
  ontimeout = ->
    cleartext.emit 'timeout'

  socket.on 'error', onerror
  socket.on 'close', onclose
  socket.on 'timeout', ontimeout

  return cleartext
