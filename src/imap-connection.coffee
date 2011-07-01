
tls             = require 'tls'
net             = require 'net'
crypto          = require 'crypto'

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

  socket.on 'error', onerror
  socket.on 'close', onclose

  return cleartext


#### starttls
##### Arguments
# * *socket*  - An encrypted socket that will be linked with a new cleartext stream.
# * *options* - An optional object with options for tls.
#     * *key*                - Contents of the SSL key file.
#     * *cert*               - Contents of the SSL cert file.
#     * *ca*                 - Array of trusted certificates. Defaults to root CAs.
#     * *server*             - Is this starttls on a Server socket?
#     * *requestCert*        - Server should request cert from client?
#     * *rejectUnauthorized* - Server should outright reject unauthorized clients.
#     * *allowUnauthorized*  - Client/Server should allow secure but unauthorized connections. e.g. self-signed certs.
# * *cb*      - A callback that will be triggered once the stream has been successfully secured. Format: `function(err) {}`
##### Return
# A cleartext stream that will transparently read/write to the encrypted socket.
#
starttls = (socket, options, cb) ->

  sslcontext = crypto.createCredentials options

  pair = tls.createSecurePair(sslcontext, options?.server, options?.requestCert, options?.rejectUnauthorized)

  socket.removeAllListeners('data')
  stream = pipe pair, socket

  pair.on 'secure', ->
    if not stream.authorized and not options.allowUnauthorized
      cb stream.authorizationError
    else
      cb

  return stream


#### createClientConnection
##### Arguments
# * *options* - An object with all of the options in it.
#     * *port*        - The port number to connect to. Defaults to 143.
#     * *host*        - The host to connect to. Defaults to '127.0.0.1.'
#     * *security*    - The security type to use. ( null, 'tls', 'ssl' ) Defaults to null.
#     * *timeout*     - The timeout period of the initial connection attempt. Defaults to 1000ms.
#     * *tlsoptions*  - The tls options for the connection. See arguments for starttls. Defaults to empty.
# * *cb*          - The callback on success or failure. Format: `function(err) { }`
#### Return
# The cleartext stream of the connection, to read and write data to.

exports.createClientConnection = ({port, host, security, timeout, tlsoptions}, cb) ->
  port ?= 143
  host ?= '127.0.0.1'
  security ?= null
  timeout ?= 1000
  options ?= {}

  connected = false

  if security == 'ssl'
    # For SSL, use a tls connection and bind a custom secure handler
    # to check if the connection is authorized and allowed after securing.
    stream = tls.connect port, host, tlsoptions, ->
      connected = true
      cb stream.authorizationError if cb and not stream.authorized and not tlsoptions.allowUnauthorized

    socket = stream.socket

  else
    # For TLS and cleartext connections, use a net connection and
    # and bind a connect handler to execute the response callback.
    stream = socket = net.createConnection port, host
    stream.on 'connect', ->
      connected = true
      cb if cb

  # Set up a timeout on the connection socket in case the connection fails.
  socket.setTimeout timeout, ->
    cb 'timeout' if cb and not connected

  socket.setKeepAlive true  # @TODO Needed?

  # For TLS connections, add a starttls method that will return a cleartext stream.
  if security == 'tls'
    stream.starttls = (callback) ->
      starttls stream, options, callback

  return stream

#### createServerConnection
##### Arguments
#
##### Return
#
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
