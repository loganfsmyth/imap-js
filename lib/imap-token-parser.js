(function() {
  var STRING_CHAR, TOKEN_END, TOKEN_START, TokenParser, Tokenizer, aggregate, async, char, greeting, keyword, process, rest_text, tokenizer,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; },
    __slice = Array.prototype.slice,
    __indexOf = Array.prototype.indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  tokenizer = require('imap-tokenizer');

  async = require('async');

  Tokenizer = tokenizer.Tokenizer;

  STRING_CHAR = tokenizer.STRING_CHAR, TOKEN_START = tokenizer.TOKEN_START, TOKEN_END = tokenizer.TOKEN_END;

  exports.TYPE_CLIENT = 0x01;

  exports.TYPE_SERVER = 0x02;

  exports.TokenParser = TokenParser = (function(_super) {

    __extends(TokenParser, _super);

    function TokenParser(type) {
      var callback, greeted,
        _this = this;
      this.type = type;
      TokenParser.__super__.constructor.call(this);
      greeted = false;
      callback = greeting();
      this.on('token', function(token) {
        return callback.call(_this, token);
      });
    }

    return TokenParser;

  })(Tokenizer);

  greeting = function() {
    var cb, parts;
    parts = [char('*'), char(' '), keyword('OK', 'PREAUTH', 'BYE'), char(' '), rest_text(), crlf()];
    cb = process(parts);
    return function(token) {
      var result;
      result = cb(token);
      if (result) {
        return {
          type: result[2],
          text: result[4]
        };
      }
    };
  };

  rest_text = function() {
    var text_code;
    text_code = null;
    return function(token) {
      if (text_code === null) return token.data;
    };
  };

  process = function(callbacks) {
    var i, results;
    i = 0;
    results = [];
    return function(token) {
      var result;
      result = callbacks[i](token);
      if (typeof result !== 'undefined') {
        results[i] = result;
        i += 1;
      }
      if (i >= callbacks.length) return results;
    };
  };

  char = function(c) {
    return aggregate(STRING_CHAR, function(token) {
      if (token.data === c) {
        return c;
      } else {
        return false;
      }
    });
  };

  keyword = function() {
    var keywords, kw, max, _i, _len;
    keywords = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    max = 0;
    for (_i = 0, _len = keywords.length; _i < _len; _i++) {
      kw = keywords[_i];
      if (kw.length > max) max = kw.length;
    }
    return aggregate(STRING_ATOM, max, function(token) {
      var str;
      str = token.data.toString();
      if (__indexOf.call(kw, str) >= 0) {
        return str;
      } else {
        return false;
      }
    });
  };

  aggregate = function() {
    var args, buffers, cb, expected_type, length, max_length, type, _i;
    args = 2 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 1) : (_i = 0, []), cb = arguments[_i++];
    expected_type = args[0];
    max_length = args[1];
    type = null;
    buffers = null;
    length = 0;
    return function(token) {
      var buffer, data, pos, _j, _len;
      if (token.type | TOKEN_START) {
        if (expected_type && !token.type | expected_type) return;
        if (token.type | TOKEN_END) {
          return cb(token);
        } else {
          type = token.type;
          buffers = [token.data];
          length += token.data;
          if (max_length && length > max_length) return;
        }
      } else if (buffers && token.type | TOKEN_END) {
        data = new Buffer(length);
        pos = 0;
        for (_j = 0, _len = buffers.length; _j < _len; _j++) {
          buffer = buffers[_j];
          buffer.copy(data, pos);
          pos += buffer.length;
        }
        return cb({
          type: type,
          data: data
        });
      } else if (buffers && token.type | type) {
        buffers.push(token.data);
      } else {
        return;
      }
    };
  };

}).call(this);
