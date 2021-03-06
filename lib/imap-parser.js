(function() {
  var Iconv, ImapParser, ipn, utf7to8, util;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  ipn = require('./imap_parser_native');
  util = require('util');
  Iconv = require('iconv').Iconv;
  utf7to8 = new Iconv('UTF-7', 'UTF-8');
  exports.ImapParser = ImapParser = (function() {
    var i, _i, _len, _ref;
    function ImapParser(type) {
      this.parser = new ipn.ImapParser(type);
      this.reinitialize(type);
      this.parser.onData = __bind(function(b, start, len, type) {
        return this.onParserData(b, start, len, type);
      }, this);
      this.parser.onStart = __bind(function(type) {
        return this.onParserStart(type);
      }, this);
      this.parser.onDone = __bind(function(type) {
        return this.onParserDone(type);
      }, this);
    }
    _ref = ['GREETING', 'RESPONSE', 'COMMAND'];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      i = _ref[_i];
      ImapParser[i] = ipn['PARSER_' + i];
    }
    ImapParser.prototype.reinitialize = function(type) {
      this.buffers = [];
      this.buffer_length = 0;
      this.values = [];
      return this.parser.reinitialize(type);
    };
    ImapParser.prototype.execute = function(b) {
      return this.parser.execute(b, 0, b.length);
    };
    ImapParser.prototype._modifiedUtf7ToUtf8 = function(data) {
      var i, result, start, _ref2;
      result = '';
      start = -1;
      for (i = 0, _ref2 = data.length; 0 <= _ref2 ? i < _ref2 : i > _ref2; 0 <= _ref2 ? i++ : i--) {
        if (data[i] === '-') {
          if (start >= 0) {
            if (i - start === 0) {
              result += '&';
            } else {
              result += utf7to8.convert(data.slice(start, i + 1).replace('&', '+').replace(',', '/'));
            }
            start = -1;
          } else {
            result += '-';
          }
        } else if (start >= 0) {} else if (data[i] === '&') {
          start = i;
        } else {
          result += data[i];
        }
      }
      return result;
    };
    ImapParser.prototype.onParserStart = function(type) {
      if (type === ipn.IMAP_COMMAND_RESPONSE || type === ipn.IMAP_GREETING_RESPONSE || type === ipn.IMAP_UNTAGGED_RESPONSE || type === ipn.IMAP_CONTINUE_RESPONSE || type === ipn.IMAP_TAGGED_RESPONSE || type === ipn.IMAP_LIST || type === ipn.IMAP_RESP_TEXT || type === ipn.IMAP_MSG_ATT || type === ipn.IMAP_BODY || type === ipn.IMAP_ENVELOPE || type === ipn.IMAP_ADDRESS || type === ipn.IMAP_SECTION || type === ipn.IMAP_KEYVALUE) {
        return this.values.push([]);
      }
    };
    ImapParser.prototype.onParserDone = function(type) {
      var body, i, kv, o, sec, section, text_code, v, _ref2, _ref3;
      v = this.values.pop();
      o = [];
      switch (type) {
        case ipn.IMAP_GREETING_RESPONSE:
          return typeof this.onGreeting === "function" ? this.onGreeting(this.zip(['type', 'text'], v)) : void 0;
        case ipn.IMAP_UNTAGGED_RESPONSE:
          o = (function() {
            switch (v[0]) {
              case 'OK':
              case 'BYE':
              case 'BAD':
              case 'NO':
                text_code = v.pop();
                v.push(text_code.text);
                v.push(text_code.code);
                return ['type', 'text', 'textcode'];
              case 'CAPABILITY':
              case 'FLAGS':
                return ['type', 'value'];
              case 'LIST':
              case 'LSUB':
                v[3] = this._modifiedUtf7ToUtf8(v[3]);
                return ['type', 'list-flags', 'delim', 'mailbox'];
              case 'SEARCH':
                if (v.length > 1) {
                  return ['type', 'value'];
                } else {
                  return ['type'];
                }
                break;
              case 'STATUS':
                return ['type', 'mailbox', 'attrs'];
              default:
                if (v[1] === 'FETCH') {
                  return ['value', 'type', 'msg-att'];
                } else {
                  return ['value', 'type'];
                }
            }
          }).call(this);
          return typeof this.onUntagged === "function" ? this.onUntagged(this.zip(o, v)) : void 0;
        case ipn.IMAP_CONTINUE_RESPONSE:
          o = Buffer.isBuffer(v[0]) ? ['base64'] : ['text'];
          return typeof this.onContinuation === "function" ? this.onContinuation(this.zip(o, v)) : void 0;
        case ipn.IMAP_TAGGED_RESPONSE:
          text_code = v.pop();
          v.push(text_code.text);
          v.push(text_code.code);
          return typeof this.onTagged === "function" ? this.onTagged(this.zip(['tag', 'type', 'text', 'textcode'], v)) : void 0;
        case ipn.IMAP_LIST:
          return this.values[this.values.length - 1].push(v);
        case ipn.IMAP_KEYVALUE:
          kv = {};
          for (i = 0, _ref2 = v.length; i < _ref2; i += 2) {
            kv[v[i]] = v[i + 1];
          }
          return this.values[this.values.length - 1].push(kv);
        case ipn.IMAP_RESP_TEXT:
          o = ['text'];
          if (typeof v[0] === 'object') {
            v[0] = this.zip(['type', 'value'], v[0]);
            o.unshift('code');
          }
          return this.values[this.values.length - 1].push(this.zip(o, v));
        case ipn.IMAP_MSG_ATT:
          if (v[0] === 'BODY' && v.length > 2) {
            body = v.splice(1);
            if (body.length > 2) {
              body = this.zip(['section', 'number', 'text'], body);
            } else {
              body = this.zip(['section', 'text'], body);
            }
            v = ['BODY', body];
          }
          if ((_ref3 = v[0]) === 'BODY' || _ref3 === 'RFC822' || _ref3 === 'RFC822.HEADER' || _ref3 === 'RFC822.TEXT' || _ref3 === 'RFC822.SIZE' || _ref3 === 'ENVELOPE' || _ref3 === 'FLAGS' || _ref3 === 'INTERNALDATE' || _ref3 === 'UID' || _ref3 === 'BODYSTRUCTURE') {
            o = ['name', 'value'];
          }
          return this.values[this.values.length - 1].push(this.zip(o, v));
        case ipn.IMAP_BODY:
          if (typeof v[0] === 'string') {
            o = ['type', 'subtype', 'fld-param', 'fld-id', 'fld-desc', 'fld-enc', 'fld-octets'];
            if (v[0] === 'MESSAGE' && v[1] === 'RFC822') {
              o = o.concat(['envelope', 'body', 'fld-lines']);
            } else if (v[0] === 'TEXT') {
              o.push('fld-lines');
            }
            if (v.length > o.length) {
              o = o.concat(['fld-md5', 'fld-dsp', 'fld-lang', 'fld-loc', 'body-extensions']);
            }
          } else {
            o = ['bodies', 'subtype'];
            if (v.length > 2) {
              o = o.concat(['fld-param', 'fld-dsp', 'fld-lang', 'fld-loc', 'body-extensions']);
            }
          }
          return this.values[this.values.length - 1].push(this.zip(o, v));
        case ipn.IMAP_ENVELOPE:
          o = ['date', 'subject', 'from', 'sender', 'reply-to', 'to', 'cc', 'bcc', 'in-reply-to', 'message-id'];
          return this.values[this.values.length - 1].push(this.zip(o, v));
        case ipn.IMAP_ADDRESS:
          o = ['name', 'adl', 'mailbox', 'host'];
          return this.values[this.values.length - 1].push(this.zip(o, v));
        case ipn.IMAP_SECTION:
          section = v.pop();
          if (typeof section === 'object') {
            sec = {
              spec: v.join('.'),
              headers: section
            };
          } else {
            v.push(section);
            sec = {
              spec: v.join('.')
            };
          }
          return this.values[this.values.length - 1].push(sec);
      }
    };
    ImapParser.prototype.zip = function(keys, vals) {
      var i, o, vl, _ref2;
      o = {};
      vl = vals.length;
      for (i = 0, _ref2 = keys.length; 0 <= _ref2 ? i < _ref2 : i > _ref2; 0 <= _ref2 ? i++ : i--) {
        if (typeof keys[i] !== 'undefined' && i < vl) {
          o[keys[i]] = vals[i];
        }
      }
      return o;
    };
    ImapParser.prototype.onParserData = function(b, start, len, type) {
      var data, info, pos, value, _j, _len2, _ref2;
      if (type === ipn.IMAP_NONE) {
        this.buffers.push({
          buf: b,
          start: start,
          len: len
        });
        this.buffer_length += len;
        return;
      }
      if (this.buffers.length > 0) {
        data = new Buffer(this.buffer_length + len);
        pos = 0;
        _ref2 = this.buffers;
        for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
          info = _ref2[_j];
          info.buf.copy(data, info.start, info.start + info.len);
          pos += info.len;
        }
        if (len > 0) {
          b.copy(data, pos, start, start + len);
        }
        this.buffers = [];
        this.buffer_length = 0;
      } else {
        data = b.slice(start, start + len);
      }
      if (type === ipn.IMAP_LITERAL_SIZE) {
        return;
      }
      value = '';
      switch (type) {
        case ipn.IMAP_ATOM:
        case ipn.IMAP_LITERAL:
        case ipn.IMAP_ASTRING:
        case ipn.IMAP_TEXT:
          value = data.toString('utf8');
          break;
        case ipn.IMAP_QUOTED:
          value = data.toString('utf8').replace('\\\\', '\\').replace('\\"', '"');
          break;
        case ipn.IMAP_NUMBER:
          value = parseInt(data.toString('utf8'), 10);
          break;
        case ipn.IMAP_TEXT_OR_BASE64:
          value = data.toString('utf8');
          if (!value.match(/\=[^\=$]|\=\=\=$/)) {
            value = new Buffer(value, 'base64');
          }
          break;
        case ipn.IMAP_BASE64:
          value = new Buffer(data.toString('utf8'), 'base64');
          break;
        case ipn.IMAP_DATETIME:
          value = new Date(data.toString('ascii'));
          break;
        case ipn.IMAP_NIL:
          value = null;
          break;
        default:
          throw new Error("Unexpected datatype encountered: " + type);
      }
      return this.values[this.values.length - 1].push(value);
    };
    return ImapParser;
  })();
}).call(this);
