
tls             = require 'tls'
net             = require 'net'
crypto          = require 'crypto'

#### pipe
# Standard pipe function very similar to the one used in node.js's tls.js
# file for making a cleartext stream from an encrypted stream.
#
# Takes a socket and a SecurePair argument and returns a cleartext stream
# that can be written to in order to transparently write encrypted data to
# the original socket.
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

  socket.on 'error', onerror
  socket.on 'close', onclose

  return cleartext


##### starttls
#
# *socket* - An encrypted socket that will be linked with a new cleartext stream.
# *options* - An optional object with options for tls.

# 
starttls = (socket, options, cb) ->

  sslcontext = crypto.createCredentials options

  pair = tls.createSecurePair(sslcontext, options?.server, options?.requestCert, options?.rejectUnauthorized)

  socket.removeAllListeners('data')
  stream = pipe pair, socket

  pair.on 'secure', ->
    if not stream.authorized and not options.allowunauth
      cb stream.authorizationError
    else
      cb

  return stream


exports.createClientConnection = ({port, host, security, timeout, tlsoptions, cb}) ->
  port ?= 143
  host ?= '127.0.0.1'
  security ?= null
  timeout ?= 1000
  options ?= {}

  connected = false

  if security == 'ssl'
    stream = tls.connect port, host, tlsoptions, ->
      connected = true
      cb stream.authorizationError if cb and not stream.authorized and not tlsoptions.allowunauth

    socket = stream.socket

  else
    stream = socket = net.createConnection port, host

    stream.on 'connect', ->
      connected = true
      cb if cb

  socket.setTimeout timeout, ->
    cb 'timeout' if cb and not connected

  socket.setKeepAlive true  # @TODO Needed?

  if security == 'tls'
    stream.starttls = (callback) =>
      starttls stream, options, callback
  else
    stream.starttls = (callback) -> callback null, @

  return stream

exports.createServerConnection = ({security, options, cb}) ->
  port ?= 143
  host ?= '127.0.0.1'
  security ?= null
  options ?= {}

  if security == 'ssl'
    server = tls.createServer options, cb
  else 
    server = net.createServer options, cb


  
  server.listen port, ip

  return server
