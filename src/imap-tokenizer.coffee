
Stream = require 'stream'

exports.STRING_QUOTED       = 0x00000001
exports.STRING_LITERAL      = 0x00000002
exports.STRING_LITERAL_SIZE = 0x00000004
exports.STRING_CHAR         = 0x00000008
exports.STRING_ATOM         = 0x00000010
exports.CRLF                = 0x00000020

exports.TOKEN_START         = 0x10000000
exports.TOKEN_END           = 0x20000000

exports.createTokenizer = (cb) ->
  tok = new Tokenizer()
  tok.on 'token', cb if cb
  return tok


exports.Tokenizer = class Tokenizer extends Stream
  constructor: ->
    super()
    @token = null
    @match = null
    @literalsize = ''
    @literalbytes = 0
    @writable = true
    @writing = false
    @destroyed = false

  end: (str, encoding) ->
    return if not @writable

    @write str, encoding if str
    @destroySoon()

  destroySoon: ->
    @writable = false

    if not @writing and @token
      @emit 'token',
        type: @token | exports.TOKEN_END,
        data: new Buffer(0)
      @token = null

    @destroy() if not @writing

  destroy: ->
    if not @destroyed
      @writable = false
      @destroyed = true
      @emit 'close'


  write: (buffer, encoding) ->
    buffer = new Buffer(buffer, encoding) if not Buffer.isBuffer(buffer)
    pos = 0
    @writing = true

    while not @destroyed and pos < buffer.length
      if @match
        pos = @consumeMatch buffer, pos

      if @token
        pos = switch @token
          when exports.STRING_QUOTED then @emitQuoted buffer, pos
          when exports.STRING_LITERAL_SIZE then @emitLiteralSize buffer, pos
          when exports.STRING_LITERAL then @emitLiteral buffer, pos
          when exports.STRING_ATOM then @emitString buffer, pos
          when exports.CRLF
            @emit 'token',
              type: exports.CRLF | exports.TOKEN_START | exports.TOKEN_END
              data: '\r\n'
            pos + 2
      else
        char = String.fromCharCode buffer[pos]
        if char == '"'
          pos = @emitQuoted buffer, pos
        else if char == '{'
          pos = @emitLiteralSize buffer, pos
        else
          if char in ['(', ')', '[', ']', ' ']
            @emit 'token',
              type: exports.STRING_CHAR | exports.TOKEN_START | exports.TOKEN_END
              data: char
            pos += 1
          else if char == "\r"
            @match = "\r\n"
            @token = exports.CRLF
          else
            pos = @emitString buffer, pos


    @writing = false

    if not @destroyed and not @writable
      @destroySoon()

    return true

  emitString: (buffer, pos) ->

    chars = ['(', ')', '{', ' ', '%', '*', '"', '\\', '[', ']']
    codes = (c.charCodeAt(0) for c in chars)

    for i in [pos..buffer.length]
      code = buffer[i]
      if code in codes or 0x00 <= code <= 0x1F or code == 0x7F
        
        if i == pos
          @emit 'token',
            type: exports.STRING_CHAR | exports.TOKEN_START | exports.TOKEN_END
            data: String.fromCharCode buffer[i]
            i += 1
        else
          @emit 'token',
            type: exports.STRING_ATOM | exports.TOKEN_END | (!@token and exports.TOKEN_START or 0)
            data: buffer[pos...i]

        @token = null
        return  i

    @emit 'token',
      type: exports.STRING_ATOM | (!@token and exports.TOKEN_START or 0)
      data: buffer[pos...]

    @token = exports.STRING_ATOM

    return buffer.length


  emitQuoted: (buffer, pos) ->
    escaped = false
    for i in [pos+1 ... buffer.length]
      char = String.fromCharCode buffer[i]
      if char == '\\'
        escaped = !escaped
      else if char == '"' && !escaped
        @emit 'token', 
          type: exports.STRING_QUOTED | exports.TOKEN_END | (!@token and exports.TOKEN_START or 0)
          data: buffer[pos+1 ... i]
        return i+1

    if pos+1 < buffer.length
      @emit 'token',
        type: exports.STRING_QUOTED | (!@token and exports.TOKEN_START or 0)
        data: buffer[pos+1...]

    @token = exports.STRING_QUOTED

    return buffer.length


  emitLiteralSize: (buffer, pos) ->
    @token = exports.STRING_LITERAL_SIZE

    open_curly = '}'.charCodeAt 0
    for i in [pos+1 ... buffer.length]
      if buffer[i] == open_curly
        @literalbytes = parseInt @literalsize, 10
        @literalsize = ''
        @emit 'token',
          type: exports.STRING_LITERAL_SIZE | exports.TOKEN_START | exports.TOKEN_END
          data: @literalsize
        @match = " \r\n"
        @token = exports.STRING_LITERAL
        return i+1

    @token = exports.STRING_LITERAL_SIZE
    @literalsize += buffer.toString 'ascii', pos+1, buffer.length

    return buffer.length

  emitLiteral: (buffer, pos) ->
    type = exports.STRING_LITERAL | (!@token and exports.TOKEN_START or 0)
    end = Math.min pos + @literalbytes, buffer.length
    @literalbytes -= end - pos

    if @literalbytes
      @token = exports.STRING_LITERAL
    else
      type |= exports.TOKEN_END

    @emit 'token',
      type: type
      data: buffer[pos...end]

    return end

  consumeMatch: (buffer, pos) ->
    for char, i in @match
      if pos + i >= buffer.length
        @match = @match[i..]
        return buffer.length
      else if buffer[pos+i] != char.charCodeAt 0
        err = new Error('Syntax error at "' + buffer[pos ...] + '"')
        err.data = buffer
        err.pos = pos
        @emit 'error', err
        return buffer.length


    len = @match.length
    @match = null
    return pos + len







