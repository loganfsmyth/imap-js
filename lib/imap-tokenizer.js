(function() {
  var EventEmitter, Tokenizer,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; },
    __indexOf = Array.prototype.indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  EventEmitter = require('events').EventEmitter;

  exports.STRING_QUOTED = 0x00000001;

  exports.STRING_LITERAL = 0x00000002;

  exports.STRING_LITERAL_SIZE = 0x00000004;

  exports.STRING_CHAR = 0x00000008;

  exports.STRING_ATOM = 0x00000010;

  exports.CRLF = 0x00000020;

  exports.TOKEN_START = 0x10000000;

  exports.TOKEN_END = 0x20000000;

  exports.createTokenizer = function(cb) {
    var tok;
    tok = new Tokenizer();
    if (cb) tok.on('token', cb);
    return tok;
  };

  exports.Tokenizer = Tokenizer = (function(_super) {

    __extends(Tokenizer, _super);

    function Tokenizer() {
      Tokenizer.__super__.constructor.call(this);
      this.token = null;
      this.match = null;
      this.literalsize = '';
      this.literalbytes = 0;
    }

    Tokenizer.prototype.write = function(buffer, encoding) {
      var char, pos;
      if (!Buffer.isBuffer(buffer)) buffer = new Buffer(buffer, encoding);
      pos = 0;
      while (pos < buffer.length) {
        if (this.match) pos = this.consumeMatch(buffer, pos);
        if (this.token) {
          pos = (function() {
            switch (this.token) {
              case exports.STRING_QUOTED:
                return this.emitQuoted(buffer, pos);
              case exports.STRING_LITERAL_SIZE:
                return this.emitLiteralSize(buffer, pos);
              case exports.STRING_LITERAL:
                return this.emitLiteral(buffer, pos);
              case exports.STRING_ATOM:
                return this.emitString(buffer, pos);
              case exports.CRLF:
                this.emit('token', {
                  type: exports.CRLF | exports.TOKEN_START | exports.TOKEN_END,
                  data: '\r\n'
                });
                return pos + 2;
            }
          }).call(this);
        } else {
          char = String.fromCharCode(buffer[pos]);
          if (char === '"') {
            pos = this.emitQuoted(buffer, pos);
          } else if (char === '{') {
            pos = this.emitLiteralSize(buffer, pos);
          } else {
            if (char === '(' || char === ')' || char === '[' || char === ']' || char === ' ') {
              this.emit('token', {
                type: exports.STRING_CHAR | exports.TOKEN_START | exports.TOKEN_END,
                data: char
              });
              pos += 1;
            } else if (char === "\r") {
              this.match = "\r\n";
              this.token = exports.CRLF;
            } else {
              pos = this.emitString(buffer, pos);
            }
          }
        }
      }
      return true;
    };

    Tokenizer.prototype.emitString = function(buffer, pos) {
      var c, chars, code, codes, i, _ref;
      chars = ['(', ')', '{', ' ', '%', '*', '"', '\\', '[', ']'];
      codes = (function() {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = chars.length; _i < _len; _i++) {
          c = chars[_i];
          _results.push(c.charCodeAt(0));
        }
        return _results;
      })();
      for (i = pos, _ref = buffer.length; pos <= _ref ? i <= _ref : i >= _ref; pos <= _ref ? i++ : i--) {
        code = buffer[i];
        if (__indexOf.call(codes, code) >= 0 || (0x00 <= code && code <= 0x1F) || code === 0x7F) {
          if (i === pos) {
            this.emit('token', {
              type: exports.STRING_CHAR | exports.TOKEN_START | exports.TOKEN_END,
              data: String.fromCharCode(buffer[i])
            }, i += 1);
          } else {
            this.emit('token', {
              type: exports.STRING_ATOM | exports.TOKEN_END | (!this.token && exports.TOKEN_START || 0),
              data: buffer.slice(pos, i)
            });
          }
          this.token = null;
          return i;
        }
      }
      this.emit('token', {
        type: exports.STRING_ATOM | (!this.token && exports.TOKEN_START || 0),
        data: buffer.slice(pos)
      });
      this.token = exports.STRING_ATOM;
      return buffer.length;
    };

    Tokenizer.prototype.emitQuoted = function(buffer, pos) {
      var char, escaped, i, _ref, _ref2;
      escaped = false;
      for (i = _ref = pos + 1, _ref2 = buffer.length; _ref <= _ref2 ? i < _ref2 : i > _ref2; _ref <= _ref2 ? i++ : i--) {
        char = String.fromCharCode(buffer[i]);
        if (char === '\\') {
          escaped = !escaped;
        } else if (char === '"' && !escaped) {
          this.emit('token', {
            type: exports.STRING_QUOTED | exports.TOKEN_END | (!this.token && exports.TOKEN_START || 0),
            data: buffer.slice(pos + 1, i)
          });
          return i + 1;
        }
      }
      if (pos + 1 < buffer.length) {
        this.emit('token', {
          type: exports.STRING_QUOTED | (!this.token && exports.TOKEN_START || 0),
          data: buffer.slice(pos + 1)
        });
      }
      this.token = exports.STRING_QUOTED;
      return buffer.length;
    };

    Tokenizer.prototype.emitLiteralSize = function(buffer, pos) {
      var i, open_curly, _ref, _ref2;
      this.token = exports.STRING_LITERAL_SIZE;
      open_curly = '}'.charCodeAt(0);
      for (i = _ref = pos + 1, _ref2 = buffer.length; _ref <= _ref2 ? i < _ref2 : i > _ref2; _ref <= _ref2 ? i++ : i--) {
        if (buffer[i] === open_curly) {
          this.literalbytes = parseInt(this.literalsize, 10);
          this.literalsize = '';
          this.emit('token', {
            type: exports.STRING_LITERAL_SIZE | exports.TOKEN_START | exports.TOKEN_END,
            data: this.literalsize
          });
          this.match = " \r\n";
          this.token = exports.STRING_LITERAL;
          return i + 1;
        }
      }
      this.token = exports.STRING_LITERAL_SIZE;
      this.literalsize += buffer.toString('ascii', pos + 1, buffer.length);
      return buffer.length;
    };

    Tokenizer.prototype.emitLiteral = function(buffer, pos) {
      var end, type;
      type = exports.STRING_LITERAL | (!this.token && exports.TOKEN_START || 0);
      end = Math.min(pos + this.literalbytes, buffer.length);
      this.literalbytes -= end - pos;
      if (this.literalbytes) {
        this.token = exports.STRING_LITERAL;
      } else {
        type |= exports.TOKEN_END;
      }
      this.emit('token', {
        type: type,
        data: buffer.slice(pos, end)
      });
      return end;
    };

    Tokenizer.prototype.consumeMatch = function(buffer, pos) {
      var char, i, len, _len, _ref;
      _ref = this.match;
      for (i = 0, _len = _ref.length; i < _len; i++) {
        char = _ref[i];
        if (pos + i >= buffer.length) {
          this.match = this.match.slice(i);
          return buffer.length;
        } else if (buffer[pos + i] !== char.charCodeAt(0)) {
          this.emit('error', {
            data: buffer,
            pos: pos
          });
          return buffer.length;
        }
      }
      len = this.match.length;
      this.match = null;
      return pos + len;
    };

    return Tokenizer;

  })(EventEmitter);

}).call(this);
