(function() {
  var Iconv, Parser, Stream, SyntaxError, addr_adl, addr_host, addr_mailbox, addr_name, address, append_args, astring, astring_chars, astring_str, atom, atom_chars, atom_specials, auth_type, body, body_ext_1part, body_ext_mpart, body_extension, body_fld_desc, body_fld_dsp, body_fld_enc, body_fld_id, body_fld_lang, body_fld_lines, body_fld_loc, body_fld_md5, body_fld_octets, body_fld_param, body_section_data, body_type_1part, body_type_1part_main, body_type_mpart, bracket_wrap, cache, capability, capability_args, capability_data, collect_until, collector, collector_emit, comma_list, command, continue_req, crlf, ctl, curly_wrap, date, date_text, date_time, digits, empty_resp, env_bcc, env_cc, env_date, env_from, env_in_reply_to, env_message_id, env_reply_to, env_sender, env_subject, env_to, envelope, err, fetch_att, fetch_attributes, flag, flag_keyword, flag_list, greeting, header_fld_name, header_list, ifset, join, l, list_char_str, list_chars, list_mailbox, list_wildcards, literal, literal_data, literal_size, lookup, mailbox, mailbox_list, mbx_list_flags, media_subtype, modifiedUtf7ToUtf8, msg_att, nil, nosep_list, nstring, null_resp, number, oneof, onres, opt, paren_wrap, password, quoted, quoted_char, quoted_char_inner, quoted_inner, quoted_specials, resp_specials, resp_text_code, response, response_data_types, response_numeric_types, response_tagged, response_untagged, route, route_key, search_args, search_key, section, section_msgtext, section_parts, section_spec, sep_list, seq_item, seq_num, seq_set, series, sp, space_list, starts_with, status_att, status_att_list, store_att_flags, str, string, subsection, tag, text, text_chars, text_code, textchar_str, time, uniqueid, userid, utf7to8, wrap, x_command, zip, zone,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; },
    __slice = Array.prototype.slice,
    __indexOf = Array.prototype.indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  Stream = require('stream');

  Iconv = require('iconv').Iconv;

  utf7to8 = new Iconv('UTF-7', 'UTF-8');

  module.exports = Parser = (function(_super) {
    var CLIENT, SERVER;

    __extends(Parser, _super);

    Parser.CLIENT = CLIENT = 0x01;

    Parser.SERVER = SERVER = 0x02;

    Parser.createParser = function(type, cb) {
      var p;
      p = new Parser(type);
      if (cb) p.on('greeting', cb);
      return p;
    };

    function Parser(type) {
      this.type = type;
      this.writable = true;
      this.destroyed = false;
      this.writing = false;
      if (this.type === CLIENT) {
        this._greeting();
      } else if (this.type === SERVER) {
        this._command();
      } else {
        throw Error("Parser type must be client or server.");
      }
    }

    Parser.prototype.emitEnabled = function(stat) {
      if (this.partial) {
        return this._setShouldEmit = stat;
      } else {
        return this._shouldEmit = stat;
      }
    };

    Parser.prototype._greeting = function() {
      var greet,
        _this = this;
      greet = greeting();
      return this.parser = function(data) {
        var result;
        _this.partial = true;
        result = greet(data);
        if (!result) return;
        _this.partial = data.pos !== data.buf.length;
        _this._response();
        _this.emit('greeting', result);
        if (!_this.partial && (_this._setShouldEmit != null)) {
          _this._shouldEmit = _this._setShouldEmit;
          _this._setShouldEmit = null;
        }
      };
    };

    Parser.prototype._response = function() {
      var resp,
        _this = this;
      resp = response();
      return this.parser = function(data) {
        var response, result, type;
        _this.partial = true;
        result = resp(data);
        if (!result) return;
        _this.partial = data.pos !== data.buf.length;
        _this._response();
        type = result.type, response = result.response;
        if (type !== 'tagged' && type !== 'untagged' && type !== 'continuation') {
          return;
        }
        _this.emit(type, response);
        if (!_this.partial && (_this._setShouldEmit != null)) {
          _this._shouldEmit = _this._setShouldEmit;
          _this._setShouldEmit = null;
        }
      };
    };

    Parser.prototype._command = function() {
      var cmd,
        _this = this;
      cmd = command();
      return this.parser = function(data) {
        var result;
        _this.partial = true;
        result = cmd(data);
        if (!result) return;
        _this.partial = data.pos !== data.buf.length;
        _this._command();
        _this.emit('command', result);
        if (!_this.partial && (_this._setShouldEmit != null)) {
          _this._shouldEmit = _this._setShouldEmit;
          _this._setShouldEmit = null;
        }
      };
    };

    Parser.prototype._handleEmit = function(type, buf, arg, remaining, name) {
      if (this._count == null) this._count = 10;
      if (name == null) name = 'C' + (this._count++);
      this.emit(type, buf, arg, remaining);
      return name;
    };

    Parser.prototype.write = function(buffer, encoding) {
      var data,
        _this = this;
      if (!Buffer.isBuffer(buffer)) buffer = new Buffer(buffer, encoding);
      this.writing = true;
      data = {
        buf: buffer,
        pos: 0,
        emit: this._shouldEmit && function() {
          var args;
          args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
          return _this._handleEmit.apply(_this, args);
        }
      };
      while (!this.destroyed && data.pos < buffer.length) {
        try {
          this.parser(data);
        } catch (e) {
          this.emit('error', e);
          this.destroy();
        }
      }
      this.writing = false;
      if (!this.destroyed && !this.writable) this.destroySoon();
      return true;
    };

    Parser.prototype.end = function(str, encoding) {
      if (!this.writable) return;
      if (str) this.write(str, encoding);
      this.destroySoon();
    };

    Parser.prototype.destroySoon = function() {
      this.writable = false;
      if (!this.writing) {
        if (this.partial) {
          this.emit('error', new SyntaxError({
            pos: 0,
            buf: new Buffer(0)
          }, 'destroy', 'Parser destroyed part-way through parsing'));
        }
        this.destroy();
      }
    };

    Parser.prototype.destroy = function() {
      if (!this.destroyed) {
        this.writable = false;
        this.destroyed = true;
        this.emit('close');
      }
    };

    return Parser;

  })(Stream);

  module.exports.SyntaxError = SyntaxError = (function(_super) {

    __extends(SyntaxError, _super);

    function SyntaxError(data, rule, extra) {
      var buf, context, end, error, i, pos, start;
      if (rule == null) rule = '';
      if (extra == null) extra = '';
      context = 30;
      this.name = "IMAPSyntaxError";
      pos = data.pos, buf = data.buf;
      start = Math.max(pos - context, 0);
      end = Math.min(pos + context, buf.length);
      error = pos - start;
      this.message = rule + (extra && "\n" + extra) + "\n" + "==" + buf.toString('utf8', start, end) + "==\n" + "  " + ((function() {
        var _results;
        _results = [];
        for (i = 0; 0 <= error ? i < error : i > error; 0 <= error ? i++ : i--) {
          _results.push(" ");
        }
        return _results;
      })()).join('') + "^\n";
    }

    return SyntaxError;

  })(Error);

  modifiedUtf7ToUtf8 = function(data) {
    var i, result, start, _ref;
    result = '';
    start = -1;
    for (i = 0, _ref = data.length; 0 <= _ref ? i < _ref : i > _ref; 0 <= _ref ? i++ : i--) {
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

  cache = function(func) {
    var cb;
    cb = null;
    return function() {
      return function() {
        if (!cb) cb = func();
        return cb();
      };
    };
  };

  greeting = function() {
    return zip([null, 'type', null, 'text-code', 'text'], series([str('* '), oneof(['OK', 'PREAUTH', 'BYE'], false, true), sp(), ifset('[', text_code()), text(), crlf()]));
  };

  response = function() {
    return zip(['type', 'response'], lookup({
      '+': continue_req(),
      '*': response_untagged(),
      '': response_tagged()
    }));
  };

  response_tagged = function() {
    var cb;
    cb = series([tag(), sp(), oneof(['OK', 'NO', 'BAD'], false, true), sp(), ifset('[', text_code()), text(), crlf()]);
    cb = zip(['tag', null, 'type', null, 'text-code', 'text'], cb);
    return series([
      function() {
        return function(data) {
          return 'tagged';
        };
      }, cb
    ]);
  };

  continue_req = function() {
    var cb;
    cb = series([str('+ '), ifset('[', text_code()), text(), crlf()]);
    cb = zip([null, 'text-code', 'text'], cb);
    return series([
      function() {
        return function(data) {
          return 'continuation';
        };
      }, cb
    ]);
  };

  response_untagged = function() {
    var cb;
    cb = series([str('* '), response_data_types(), crlf()], 1);
    return series([
      function() {
        return function(data) {
          return 'untagged';
        };
      }, cb
    ]);
  };

  response_data_types = function() {
    var cb, resp_text;
    resp_text = series([sp(), ifset('[', text_code()), text()], [1, 2]);
    cb = route({
      "OK": resp_text,
      "NO": resp_text,
      "BAD": resp_text,
      "BYE": resp_text,
      "FLAGS": series([sp(), flag_list()], 1),
      "LIST": series([sp(), mailbox_list()], 1),
      "LSUB": series([sp(), mailbox_list()], 1),
      "SEARCH": starts_with(' ', series([sp(), space_list(number(true))], 1), empty_resp()),
      "STATUS": zip([null, 'mailbox', null, 'attributes'], series([
        sp(), mailbox(), sp(), onres(paren_wrap(status_att_list()), function(result) {
          var obj, r, _i, _len;
          obj = {};
          for (_i = 0, _len = result.length; _i < _len; _i++) {
            r = result[_i];
            obj[r[0]] = r[1];
          }
          return obj;
        })
      ])),
      "CAPABILITY": capability_args()
    }, response_numeric_types());
    return onres(cb, function(result) {
      var key;
      key = result[0].toString('ascii');
      switch (key) {
        case 'OK':
        case 'NO':
        case 'BAD':
        case 'BYE':
          return {
            'type': key,
            'text-code': result[1][0],
            'text': result[1][1]
          };
        case 'CAPABILITY':
        case 'FLAGS':
        case 'LIST':
        case 'LSUB':
        case 'SEARCH':
        case 'STATUS':
          return {
            'type': key,
            'value': result[1]
          };
        default:
          return {
            'type': key,
            'value': result[2],
            'id': parseInt(result[1], 10)
          };
      }
    });
  };

  response_numeric_types = function() {
    var f_code, fetch_cb, fetch_resp, msg_att_cb, other_kw, other_resp, space_cb;
    space_cb = sp();
    fetch_cb = str('FETCH');
    msg_att_cb = msg_att();
    fetch_resp = function(key) {
      var fetch_handler, msg_att_handler, space;
      space = space_cb();
      fetch_handler = fetch_cb();
      msg_att_handler = msg_att_cb(key);
      return function(data) {
        var result;
        if (fetch_handler) {
          if (!fetch_handler(data)) return;
          if (key[0] === 0x30) {
            err(data, 'fetch_resp', 'FETCH ids must be positive');
          }
          fetch_handler = null;
        }
        if (space) {
          if (!space(data)) return;
          space = null;
        }
        result = msg_att_handler(data);
        if (typeof result === 'undefined') return;
        return ['FETCH', key, result];
      };
    };
    other_kw = oneof(['EXISTS', 'RECENT', 'EXPUNGE']);
    other_resp = function(key) {
      var handler;
      handler = other_kw();
      return function(data) {
        var result;
        result = handler(data);
        if (typeof result === 'undefined') return;
        if (result === 'EXPUNGE' && key[0] === 0x30) {
          err(data, 'expunge_resp', 'EXPUNGE ids must be positive');
        }
        return [result, key];
      };
    };
    f_code = 'F'.charCodeAt(0);
    return function(key) {
      var handler, space;
      handler = null;
      space = space_cb();
      return function(data) {
        if (space) {
          if (!space(data)) return;
          space = null;
        }
        if (!handler) {
          if (data.buf[data.pos] === f_code) {
            handler = fetch_resp(key);
          } else {
            handler = other_resp(key);
          }
        }
        return handler(data);
      };
    };
  };

  sp = cache(function() {
    return str(' ');
  });

  text_code = cache(function() {
    return series([bracket_wrap(resp_text_code()), sp()], 0);
  });

  body_section_data = function() {
    var body_cb, partial_cb, section_cb, space_cb;
    section_cb = section();
    partial_cb = starts_with('<', wrap('<', '>', number()), null_resp());
    space_cb = sp();
    body_cb = starts_with('N', nil(), string('body'));
    return function(id) {
      var body_data, body_handler, partial_handler, section_handler, space_handler;
      section_handler = section_cb();
      partial_handler = partial_cb();
      space_handler = space_cb();
      body_handler = body_cb();
      body_data = {};
      return function(data) {
        var par, res, sec;
        if (section_handler) {
          sec = section_handler(data);
          if (typeof sec === 'undefined') return;
          body_data.section = sec;
          section_handler = null;
        }
        if (partial_handler) {
          par = partial_handler(data);
          if (typeof par === 'undefined') return;
          body_data.partial = par;
          partial_handler = null;
        }
        if (space_handler) {
          if (!space_handler(data)) return;
          space_handler = null;
        }
        data.emit_arg = body_data;
        res = body_handler(data);
        if (typeof res === 'undefined') return;
        body_data.value = res;
        return body_data;
      };
    };
  };

  msg_att = function() {
    var body_struc, rfc_text;
    body_struc = series([sp(), body()], 1);
    rfc_text = series([sp(), nstring()], 1);
    return paren_wrap(space_list(zip(['type', 'value'], route({
      'FLAGS': series([sp(), paren_wrap(space_list(flag(false), ')'))], 1),
      'ENVELOPE': series([sp(), envelope()], 1),
      'INTERNALDATE': series([sp(), date_time()], 1),
      'RFC822': rfc_text,
      'RFC822.HEADER': rfc_text,
      'RFC822.TEXT': rfc_text,
      'RFC822.SIZE': series([sp(), number()], 1),
      'BODYSTRUCTURE': body_struc,
      'BODY': starts_with(' ', body_struc, body_section_data()),
      'UID': series([sp(), uniqueid()], 1)
    }))));
  };

  envelope = function() {
    var cb;
    cb = paren_wrap(series([env_date(), sp(), env_subject(), sp(), env_from(), sp(), env_sender(), sp(), env_reply_to(), sp(), env_to(), sp(), env_cc(), sp(), env_bcc(), sp(), env_in_reply_to(), sp(), env_message_id()]));
    return zip(['date', null, 'subject', null, 'from', null, 'sender', null, 'reply-to', null, 'to', null, 'cc', null, 'bcc', null, 'in-reply-to', null, 'message-id'], cb);
  };

  env_date = env_subject = env_message_id = env_in_reply_to = function() {
    return nstring();
  };

  env_from = env_sender = env_reply_to = env_to = env_cc = env_bcc = function() {
    return starts_with('N', nil(), paren_wrap(nosep_list(address())));
  };

  date_text = function() {
    return join(series([starts_with(' ', series([sp(), digits(1)]), digits(2)), str('-'), oneof(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], false, true), str('-'), digits(4)]));
  };

  date_time = function() {
    var cb;
    cb = join(series([str('"'), starts_with(' ', series([sp(), digits(1)]), digits(2)), str('-'), oneof(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], false, true), str('-'), digits(4), sp(), time(), sp(), zone(), str('"')], [1, 2, 3, 4, 5, 6, 7, 8, 9]));
    return onres(cb, function(result) {
      return new Date(result);
    });
  };

  time = function() {
    return join(series([digits(2), str(':'), digits(2), str(':'), digits(2)]));
  };

  zone = function() {
    return join(series([oneof(['-', '+']), digits(4)]));
  };

  address = function() {
    var cb;
    cb = paren_wrap(series([addr_name(), sp(), addr_adl(), sp(), addr_mailbox(), sp(), addr_host()]));
    return zip(['name', null, 'adl', null, 'mailbox', null, 'host'], cb);
  };

  addr_name = addr_adl = addr_mailbox = addr_host = function() {
    return nstring();
  };

  body_ext_mpart = function() {
    return zip(['param', 'dsp', 'lang', 'loc', 'ext'], series([body_fld_param(), ifset(' ', series([sp(), body_fld_dsp()], 1)), ifset(' ', series([sp(), body_fld_lang()], 1)), ifset(' ', series([sp(), body_fld_loc()], 1)), ifset(' ', series([sp(), body_extension()], 1))]));
  };

  body_ext_1part = function() {
    return zip(['md5', 'dsp', 'lang', 'loc', 'ext'], series([body_fld_md5(), ifset(' ', series([sp(), body_fld_dsp()], 1)), ifset(' ', series([sp(), body_fld_lang()], 1)), ifset(' ', series([sp(), body_fld_loc()], 1)), ifset(' ', series([sp(), body_extension()], 1))]));
  };

  body_fld_md5 = function() {
    return nstring();
  };

  body_fld_dsp = function() {
    var params;
    params = zip(['name', null, 'values'], paren_wrap(series([string(), sp(), body_fld_param()])));
    return starts_with('(', params, nil());
  };

  body_fld_param = function() {
    return paren_wrap(space_list(zip(['key', null, 'value'], series([string(), sp(), string()]))));
  };

  body_fld_lang = function() {
    return starts_with('(', paren_wrap(space_list(string())), nstring());
  };

  body_fld_loc = function() {
    return nstring();
  };

  body_extension = cache(function() {
    var map, n;
    map = {};
    for (n = 0; n <= 9; n++) {
      map[n] = number();
    }
    map['('] = paren_wrap(space_list(body_extension()));
    map[''] = nstring();
    return lookup(map);
  });

  media_subtype = function() {
    return string();
  };

  body_type_mpart = function() {
    return zip(['body', null, 'subtype', 'ext'], series([
      nosep_list((function() {
        return body()();
      }), ' '), sp(), media_subtype(), ifset(' ', series([sp(), body_ext_mpart()], 1))
    ]));
  };

  body_type_1part = function() {
    return zip(['body', 'ext'], series([body_type_1part_main(), ifset(' ', series([sp(), body_ext_1part()], 1))]));
  };

  body_fld_lines = function() {
    return number();
  };

  body_fld_id = function() {
    return nstring();
  };

  body_fld_desc = function() {
    return nstring();
  };

  body_fld_enc = function() {
    return string();
  };

  body_fld_octets = function() {
    return number();
  };

  body_type_1part_main = function() {
    var body_fields, body_type_basic, body_type_msg, body_type_text, cb;
    cb = series([string(), sp(), media_subtype()], [0, 2]);
    body_fields = zip(['param', null, 'id', null, 'desc', null, 'enc', null, 'octets'], series([body_fld_param(), sp(), body_fld_id(), sp(), body_fld_desc(), sp(), body_fld_enc(), sp(), body_fld_octets()]));
    body_type_msg = zip([null, 'fields', null, 'env', null, 'body', null, 'lines'], series([sp(), body_fields, sp(), envelope(), sp(), body(), sp(), body_fld_lines()]));
    body_type_text = zip([null, 'fields', null, 'lines'], series([sp(), body_fields, sp(), body_fld_lines()]));
    body_type_basic = zip([null, 'fields'], series([sp(), body_fields]));
    return function() {
      var handler, media;
      handler = cb();
      media = null;
      return function(data) {
        var result, subtype, type;
        if (!media) {
          result = handler(data);
          if (typeof result === 'undefined') return;
          media = result;
          type = media[0].toString('ascii').toUpperCase();
          subtype = media[1].toString('ascii').toUpperCase();
          if (type === 'MESSAGE' && subtype === 'RFC822') {
            handler = body_type_msg();
          } else if (type === 'TEXT') {
            handler = body_type_text();
          } else {
            handler = body_type_basic();
          }
        }
        result = handler(data);
        if (typeof result === 'undefined') return;
        result.type = media[0];
        result.subtype = media[1];
        return result;
      };
    };
  };

  body = cache(function() {
    return paren_wrap(starts_with('(', body_type_mpart(), body_type_1part()));
  });

  section = function() {
    return bracket_wrap(starts_with(']', null_resp(), section_spec()));
  };

  section_msgtext = function(showmine) {
    var routes;
    routes = {
      "HEADER": null,
      "HEADER.FIELDS": series([sp(), header_list()], 1),
      "HEADER.FIELDS.NOT": series([sp(), header_list()], 1),
      "TEXT": null
    };
    if (showmine) routes['MIME'] = null;
    return route(routes);
  };

  section_spec = function() {
    return starts_with('H', section_msgtext(), starts_with('T', section_msgtext(), section_parts()));
  };

  section_parts = function() {
    var codes, dot, num;
    num = number(true);
    dot = '.'.charCodeAt(0);
    codes = ['H'.charCodeAt(0), 'T'.charCodeAt(0), 'M'.charCodeAt(0)];
    return function() {
      var next_cb, num_cb, num_found;
      num_cb = num();
      num_found = 0;
      next_cb = null;
      return function(data) {
        var result;
        if (next_cb) {
          result = next_cb(data);
          if (typeof result === 'undefined') return;
          result.unshift(num_found);
          return result;
        }
        if (num_found) {
          if (data.buf[data.pos] !== dot) return [num_found];
          data.pos += 1;
          next_cb = function(data) {
            var tmp, _ref;
            if (_ref = data.buf[data.pos], __indexOf.call(codes, _ref) >= 0) {
              tmp = onres(section_msgtext(true), function(result) {
                return [result];
              });
              next_cb = tmp();
            } else {
              next_cb = section_parts()();
            }
          };
        } else {
          result = num_cb(data);
          if (typeof result === 'undefined') return;
          num_found = result;
        }
      };
    };
  };

  header_list = function() {
    return paren_wrap(space_list(header_fld_name()));
  };

  header_fld_name = function() {
    return astring();
  };

  uniqueid = function() {
    return number(true);
  };

  flag_list = function() {
    return paren_wrap(space_list(flag(), ')'));
  };

  mailbox_list = function() {
    return zip(['flags', null, 'char', null, 'mailbox'], series([paren_wrap(mbx_list_flags()), sp(), starts_with('"', quoted_char(), nil()), sp(), mailbox()]));
  };

  mbx_list_flags = function() {
    return space_list(join(series([str('\\'), atom()])), ')');
  };

  nil = cache(function() {
    return onres(str('NIL', true), function(result) {
      return null;
    });
  });

  quoted_char = function() {
    return wrap('"', '"', quoted_char_inner());
  };

  quoted_char_inner = function() {
    var cb, chars, quote, slash;
    quote = '"'.charCodeAt(0);
    slash = '\\'.charCodeAt(0);
    chars = text_chars();
    cb = function() {
      var escaped;
      escaped = false;
      return function(data) {
        var code;
        if (!escaped) {
          code = data.buf[data.pos];
          if (code === slash) {
            escaped = true;
            data.pos += 1;
          } else if (__indexOf.call(chars, code) >= 0 && code !== quote) {
            data.pos += 1;
            return data.buf.slice(data.pos - 1, data.pos);
          } else {
            err(data, 'quoted_char_inner', 'must contain a text-char and no unescaped quotes');
          }
        }
        if (data.pos >= data.buf.length) return;
        code = data.buf[data.pos];
        if (code === quote || code === slash) {
          data.pos += 1;
          return data.buf.slice(data.pos - 1, data.pos);
        } else {
          return err(data, 'quoted_char_inner', 'Only quotes and slashes can be escaped');
        }
      };
    };
    return onres(cb, function(r) {
      return r.toString('ascii').replace(/\\([\\"])/, '$1');
    });
  };

  mailbox = cache(function() {
    var cb;
    cb = astring();
    return onres(cb, modifiedUtf7ToUtf8);
  });

  status_att = function() {
    return oneof(['MESSAGES', 'RECENT', 'UIDNEXT', 'UIDVALIDITY', 'UNSEEN'], false, true);
  };

  status_att_list = function() {
    var status_att_pair;
    status_att_pair = series([status_att(), sp(), number()], [0, 2]);
    return space_list(status_att_pair, ')');
  };

  tag = function() {
    var cb, chars;
    chars = astring_chars();
    cb = collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (__indexOf.call(chars, code) < 0) return i;
        }
      };
    });
    return onres(cb, function(result) {
      return result.toString('ascii');
    });
  };

  resp_text_code = function() {
    var atom_args, badcharset_args, permanentflags_args, space_num, text_codes;
    space_num = series([sp(), number(true)], 1);
    badcharset_args = series([sp(), paren_wrap(space_list(astring()))], 1);
    permanentflags_args = series([sp(), paren_wrap(space_list(flag(true), ')'))], 1);
    atom_args = lookup({
      ' ': series([sp(), textchar_str()], 1),
      '': null_resp()
    });
    text_codes = route({
      'ALERT': null,
      'BADCHARSET': lookup({
        ' ': badcharset_args,
        '': empty_resp()
      }),
      'CAPABILITY': capability_args(),
      'PARSE': null,
      'PERMANENTFLAGS': permanentflags_args,
      'READ-ONLY': null,
      'READ-WRITE': null,
      'TRYCREATE': null,
      'UIDNEXT': space_num,
      'UIDVALIDITY': space_num,
      'UNSEEN': space_num
    }, function(key) {
      var handler;
      handler = atom_args();
      return function(data) {
        var result;
        result = handler(data);
        if (typeof result === 'undefined') return;
        return [key, result];
      };
    });
    return zip(['key', 'value'], text_codes);
  };

  empty_resp = function() {
    return function() {
      return function(data) {
        return [];
      };
    };
  };

  null_resp = function() {
    return function() {
      return function(data) {
        return null;
      };
    };
  };

  flag = function(star) {
    var slash_flags;
    slash_flags = star ? lookup({
      '*': str('*'),
      '': atom()
    }) : atom();
    return lookup({
      '\\': join(series([str('\\'), slash_flags])),
      '': atom()
    });
  };

  capability_args = function() {
    return series([sp(), capability_data()], 1);
  };

  capability_data = function() {
    return space_list(capability());
  };

  capability = function() {
    return atom();
  };

  crlf = cache(function() {
    return join(series([opt("\r"), str("\n")]));
  });

  bracket_wrap = function(cb) {
    return wrap('[', ']', cb);
  };

  paren_wrap = function(cb) {
    return wrap('(', ')', cb);
  };

  curly_wrap = function(cb) {
    return wrap('{', '}', cb);
  };

  astring = cache(function() {
    return lookup({
      '{': string(),
      '"': string(),
      '': astring_str()
    });
  });

  nstring = cache(function() {
    return starts_with('N', nil(), string());
  });

  digits = function(num) {
    var cb;
    cb = collect_until(function() {
      var i;
      i = 0;
      return function(data) {
        var code, j, _i, _len, _ref, _results;
        _ref = data.buf.slice(data.pos);
        for (j = 0, _len = _ref.length; j < _len; j++) {
          code = _ref[j];
          i++;
          if (__indexOf.call((function() {
            _results = [];
            for (var _i = 0x30; 0x30 <= 0x39 ? _i <= 0x39 : _i >= 0x39; 0x30 <= 0x39 ? _i++ : _i--){ _results.push(_i); }
            return _results;
          }).apply(this), code) < 0) {
            err(data, 'digits', 'expected a number between 0 and 9');
          }
          if (i === num) return j + 1;
        }
      };
    });
    return onres(cb, function(r) {
      return r.toString('ascii');
    });
  };

  number = function(nz) {
    return function() {
      var first_range, i, s, _i, _j, _results, _results2;
      i = 0;
      s = '';
      first_range = nz && (function() {
        _results = [];
        for (var _i = 0x31; 0x31 <= 0x39 ? _i <= 0x39 : _i >= 0x39; 0x31 <= 0x39 ? _i++ : _i--){ _results.push(_i); }
        return _results;
      }).apply(this) || (function() {
        _results2 = [];
        for (var _j = 0x30; 0x30 <= 0x39 ? _j <= 0x39 : _j >= 0x39; 0x30 <= 0x39 ? _j++ : _j--){ _results2.push(_j); }
        return _results2;
      }).apply(this);
      return function(data) {
        var code, _k, _l, _len, _ref, _results3;
        _ref = data.buf.slice(data.pos);
        for (_k = 0, _len = _ref.length; _k < _len; _k++) {
          code = _ref[_k];
          if (i === 0 && __indexOf.call(first_range, code) < 0) {
            err(data, 'number', 'First digit must be between #{if nz then 1 else 0} and 9');
          }
          if (__indexOf.call((function() {
            _results3 = [];
            for (var _l = 0x30; 0x30 <= 0x39 ? _l <= 0x39 : _l >= 0x39; 0x30 <= 0x39 ? _l++ : _l--){ _results3.push(_l); }
            return _results3;
          }).apply(this), code) < 0) {
            return parseInt(s, 10);
          }
          data.pos += 1;
          i += 1;
          s += String.fromCharCode(code);
        }
      };
    };
  };

  string = function(emit) {
    return lookup({
      '{': literal(emit),
      '"': quoted(emit),
      '': function() {
        return function(data) {
          return err(data, 'string', 'Expected a { or " at the start of the string.');
        };
      }
    });
  };

  quoted = function(emit) {
    return wrap('"', '"', quoted_inner(emit));
  };

  collect_until = function(cb, none) {
    return function(arg) {
      var col, handler;
      col = collector();
      handler = cb(arg);
      return function(data) {
        var all, i;
        i = handler(data);
        if (typeof i === 'undefined') {
          col(data.buf.slice(data.pos));
          data.pos = data.buf.length;
        } else {
          if (i !== 0) col(data.buf.slice(data.pos, (data.pos + i)));
          data.pos += i;
          all = col();
          if (all || none) return all;
          err(data, 'collect_until', 'must have at least one value');
        }
      };
    };
  };

  textchar_str = function() {
    var brac, cb, chars;
    chars = text_chars();
    brac = ']'.charCodeAt(0);
    cb = collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (__indexOf.call(chars, code) < 0 || code === brac) return i;
        }
      };
    });
    return onres(cb, function(result) {
      return result.toString('ascii');
    });
  };

  atom = cache(function() {
    var cb, chars;
    chars = atom_chars();
    cb = collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (__indexOf.call(chars, code) < 0) return i;
        }
      };
    });
    return onres(cb, function(result) {
      return result.toString('ascii');
    });
  });

  text = cache(function() {
    var cb, cr, lf;
    cr = "\r".charCodeAt(0);
    lf = "\n".charCodeAt(0);
    cb = collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (code === cr || code === lf) return i;
        }
      };
    });
    return onres(cb, function(result) {
      return result.toString('ascii');
    });
  });

  collector_emit = function(type, cb) {
    var placeholder;
    placeholder = null;
    return function(d, arg, remaining) {
      if (remaining == null) remaining = null;
      if (d) {
        if (placeholder == null) {
          placeholder = cb(type, d, arg, remaining, placeholder);
        }
      } else {
        return placeholder;
      }
    };
  };

  quoted_inner = function(emit) {
    var quote, slash;
    slash = '\\'.charCodeAt(0);
    quote = '"'.charCodeAt(0);
    return function() {
      var col, escaped, init;
      col = null;
      init = false;
      escaped = false;
      return function(data) {
        var code, i, ret, start, _len, _ref;
        if (!init) {
          init = true;
          if (emit && data.emit) {
            col = collector_emit(emit, data.emit);
          } else {
            col = collector(true);
          }
        }
        start = 0;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (escaped) {
            escaped = false;
            if (code !== slash && code !== quote) {
              err(data, 'quoted_inner', 'Quoted strings can only escape quotes and slashes');
            }
          } else if (code === slash) {
            if (start !== i) {
              col(data.buf.slice(data.pos + start, (data.pos + i)), data.emit_arg);
            }
            escaped = true;
            start = i + 1;
          } else if (code === quote) {
            if (start !== i) {
              col(data.buf.slice(data.pos + start, (data.pos + i)), data.emit_arg);
            }
            ret = col();
            data.pos += i;
            return ret.toString('binary');
          }
        }
        if (start !== data.buf.length) col(data.buf.slice(data.pos + start));
        return data.pos = data.buf.length;
      };
    };
  };

  literal = function(emit) {
    var literal_dat, nl, size;
    size = literal_size();
    nl = crlf();
    literal_dat = literal_data(emit);
    return function() {
      var dat, length, nl_cb, size_cb;
      size_cb = size();
      nl_cb = nl();
      dat = null;
      length = 0;
      return function(data) {
        var result;
        if (size_cb) {
          result = size_cb(data);
          if (typeof result === 'undefined') return;
          length = result;
          size_cb = null;
          dat = literal_dat(length);
        }
        if (nl_cb) {
          result = nl_cb(data);
          if (typeof result === 'undefined') return;
          nl_cb = null;
        }
        result = dat(data);
        if (typeof result !== 'undefined') return result;
      };
    };
  };

  literal_size = function() {
    return curly_wrap(number());
  };

  literal_data = function(emit) {
    return function(size) {
      var col, init, placeholder, remaining;
      init = false;
      col = null;
      placeholder = null;
      remaining = size;
      return function(data) {
        var buf, code, len, _i, _len;
        if (!init) {
          init = true;
          if (!emit || !data.emit) {
            col = collector(true);
          } else {
            col = collector_emit(emit, data.emit);
          }
        }
        len = Math.min(data.buf.length - data.pos, remaining);
        remaining -= len;
        buf = data.buf.slice(data.pos, (data.pos + len));
        data.pos += len;
        for (_i = 0, _len = buf.length; _i < _len; _i++) {
          code = buf[_i];
          if (code < 0x01 || code > 0xFF) {
            err(data, 'literal_data', 'Literals can only bytes between 1 and 255');
          }
        }
        col(buf, data.emit_arg, remaining);
        if (remaining === 0) return col().toString('binary');
      };
    };
  };

  astring_str = function() {
    var cb, chars;
    chars = astring_chars();
    cb = collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (__indexOf.call(chars, code) < 0) return i;
        }
      };
    });
    return onres(cb, function(r) {
      return r.toString('ascii');
    });
  };

  list_char_str = function() {
    var cb, chars;
    chars = list_chars();
    cb = collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (__indexOf.call(chars, code) < 0) return i;
        }
      };
    });
    return onres(cb, function(r) {
      return r.toString('ascii');
    });
  };

  str = function(s, insens) {
    var buffer, mask;
    if (insens) s = s.toUpperCase();
    buffer = new Buffer(s);
    mask = insens ? 0xEF : 0xFF;
    return function() {
      var i;
      i = 0;
      return function(data) {
        var buf, pos;
        pos = data.pos, buf = data.buf;
        while (pos < buf.length && i < buffer.length) {
          if ((buf[pos] & mask) !== buffer[i]) {
            err(data, 'str', 'failed to match "' + s + '"');
          }
          i += 1;
          pos += 1;
        }
        data.pos = pos;
        if (i === buffer.length) return s;
      };
    };
  };

  collector = function(allow_empty) {
    var buffers, length;
    buffers = [];
    length = 0;
    return function(b) {
      var all, buf, pos, _i, _len;
      if (!b) {
        if (!allow_empty && length === 0) return null;
        if (buffers.length === 1) {
          all = buffers[0];
        } else {
          all = new Buffer(length);
          pos = 0;
          for (_i = 0, _len = buffers.length; _i < _len; _i++) {
            buf = buffers[_i];
            buf.copy(all, pos);
            pos += buf.length;
          }
        }
        buffers = [];
        return all;
      } else {
        length += b.length;
        buffers.push(b);
      }
    };
  };

  list_wildcards = (function() {
    var b;
    b = new Buffer('%*');
    return function() {
      return b;
    };
  })();

  quoted_specials = (function() {
    var b;
    b = new Buffer('"\\');
    return function() {
      return b;
    };
  })();

  resp_specials = (function() {
    var b;
    b = new Buffer(']');
    return function() {
      return b;
    };
  })();

  ctl = (function() {
    var b, chars, _i, _results;
    chars = (function() {
      _results = [];
      for (var _i = 0x00; 0x00 <= 0x1F ? _i <= 0x1F : _i >= 0x1F; 0x00 <= 0x1F ? _i++ : _i--){ _results.push(_i); }
      return _results;
    }).apply(this);
    chars.push(0x7F);
    b = new Buffer(chars);
    chars = null;
    return function() {
      return b;
    };
  })();

  atom_specials = (function() {
    var b, col;
    col = collector();
    col(new Buffer('(){ '));
    col(list_wildcards());
    col(quoted_specials());
    col(resp_specials());
    col(ctl());
    b = col();
    col = null;
    return function() {
      return b;
    };
  })();

  atom_chars = (function() {
    var b, c;
    b = new Buffer((function() {
      var _results;
      _results = [];
      for (c = 0x01; 0x01 <= 0x7F ? c <= 0x7F : c >= 0x7F; 0x01 <= 0x7F ? c++ : c--) {
        if (__indexOf.call(atom_specials(), c) < 0) _results.push(c);
      }
      return _results;
    })());
    return function() {
      return b;
    };
  })();

  astring_chars = (function() {
    var ac, b, rs;
    ac = atom_chars();
    rs = resp_specials();
    b = new Buffer(ac.length + rs.length);
    ac.copy(b, 0);
    rs.copy(b, ac.length);
    return function() {
      return b;
    };
  })();

  text_chars = (function() {
    var b, c;
    b = new Buffer((function() {
      var _results;
      _results = [];
      for (c = 0x01; 0x01 <= 0x7F ? c <= 0x7F : c >= 0x7F; 0x01 <= 0x7F ? c++ : c--) {
        if (c !== 10 && c !== 13) _results.push(c);
      }
      return _results;
    })());
    return function() {
      return b;
    };
  })();

  list_chars = (function() {
    var b, col;
    col = collector();
    col(atom_chars());
    col(list_wildcards());
    col(resp_specials());
    b = col();
    col = null;
    return function() {
      return b;
    };
  })();

  lookup = function(map) {
    var k, v;
    for (k in map) {
      if (!__hasProp.call(map, k)) continue;
      v = map[k];
      delete map[k];
      if (k === '') {
        map[0] = v;
      } else {
        k = k.charCodeAt(0);
        map[k] = v;
      }
    }
    return function(arg) {
      var handler;
      handler = null;
      return function(data) {
        var c;
        if (!handler) {
          c = data.buf[data.pos];
          handler = map[c] ? map[c](arg) : map[0](arg);
        }
        return handler(data);
      };
    };
  };

  starts_with = function(c, y, n) {
    var cmp;
    cmp = {};
    cmp[c] = y;
    cmp[''] = n;
    return lookup(cmp);
  };

  ifset = function(c, cb) {
    return starts_with(c, cb, null_resp());
  };

  nosep_list = function(cb, end_char, allow_none) {
    var close_code, sp_code;
    if (end_char == null) end_char = ')';
    sp_code = ' '.charCodeAt(0);
    close_code = end_char.charCodeAt(0);
    return function() {
      var check_done, handler, i, results, sep;
      results = [];
      handler = cb();
      check_done = !!allow_none;
      i = 0;
      sep = false;
      return function(data) {
        var result;
        if (check_done) {
          if (data.buf[data.pos] === close_code) return results;
          check_done = false;
        }
        if (sep && data.buf[data.pos] === sp_code) {
          sep = false;
          data.pos += 1;
          if (data.pos === data.buf.length) return;
        }
        sep = false;
        result = handler(data);
        if (typeof result === 'undefined') return;
        sep = true;
        results.push(result);
        handler = cb();
        check_done = true;
      };
    };
  };

  sep_list = function(sep_char, none_char, cb) {
    var none_code, sepcode;
    sepcode = sep_char.charCodeAt(0);
    none_code = none_char && none_char.charCodeAt(0);
    return function(arg) {
      var handler, i, results, sep;
      results = [];
      handler = cb(arg);
      sep = true;
      i = 0;
      return function(data) {
        var result;
        i += 1;
        if (!results.length) {
          if (i === 1 && none_code && data.buf[data.pos] === none_code) return [];
          result = handler(data);
          if (typeof result === 'undefined') return;
          results.push(result);
          return;
        }
        if (sep) {
          if (data.buf[data.pos] !== sepcode) return results;
          sep = false;
          data.pos += 1;
          handler = cb(arg);
          return;
        }
        result = handler(data);
        if (typeof result === 'undefined') return;
        results.push(result);
        sep = true;
      };
    };
  };

  space_list = function(cb, none_char) {
    return sep_list(' ', none_char, cb);
  };

  comma_list = function(cb) {
    return sep_list(',', false, cb);
  };

  opt = function(c) {
    return starts_with(c, function() {
      return function(data) {
        data.pos += 1;
        return c;
      };
    }, function() {
      return function(data) {
        return '';
      };
    });
  };

  wrap = function(open, close, cb) {
    return series([str(open), cb, str(close)], 1);
  };

  err = function(data, rule, extra) {
    throw new SyntaxError(data, rule, extra);
  };

  join = function(cb) {
    return function() {
      var data_cb;
      data_cb = cb();
      return function(data) {
        var result;
        result = data_cb(data);
        if (typeof result !== 'undefined') return result.join('');
      };
    };
  };

  oneof = function(strs, nomatch, insens) {
    return function() {
      var i, matches;
      matches = strs;
      i = 0;
      return function(data) {
        var code, s, _i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          code = _ref[_i];
          matches = (function() {
            var _j, _len2, _results;
            _results = [];
            for (_j = 0, _len2 = matches.length; _j < _len2; _j++) {
              s = matches[_j];
              if (s[i].charCodeAt(0) === code) _results.push(s);
            }
            return _results;
          })();
          i += 1;
          data.pos += 1;
          if (!matches.length || matches.length === 1 && matches[0].length === i) {
            break;
          }
        }
        if (matches.length === 1 && matches[0].length === i) {
          return matches[0];
        } else if (matches.length === 0) {
          data.pos -= 1;
          if (!nomatch) {
            return err(data, 'oneof', 'No matches in ' + strs.join(','));
          } else {
            return null;
          }
        }
      };
    };
  };

  route_key = function() {
    var cb, dash, dot, lower, nums, upper, _i, _j, _k, _results, _results2, _results3;
    nums = (function() {
      _results = [];
      for (var _i = 0x30; 0x30 <= 0x39 ? _i <= 0x39 : _i >= 0x39; 0x30 <= 0x39 ? _i++ : _i--){ _results.push(_i); }
      return _results;
    }).apply(this);
    upper = (function() {
      _results2 = [];
      for (var _j = 0x41; 0x41 <= 0x5A ? _j <= 0x5A : _j >= 0x5A; 0x41 <= 0x5A ? _j++ : _j--){ _results2.push(_j); }
      return _results2;
    }).apply(this);
    lower = (function() {
      _results3 = [];
      for (var _k = 0x61; 0x61 <= 0x7A ? _k <= 0x7A : _k >= 0x7A; 0x61 <= 0x7A ? _k++ : _k--){ _results3.push(_k); }
      return _results3;
    }).apply(this);
    dash = '-'.charCodeAt(0);
    dot = '.'.charCodeAt(0);
    cb = collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if ((code !== dash && code !== dot) && __indexOf.call(nums, code) < 0 && __indexOf.call(upper, code) < 0 && __indexOf.call(lower, code) < 0) {
            return i;
          }
        }
      };
    });
    return onres(cb, function(result) {
      return result.toString('ascii');
    });
  };

  route = function(routes, nomatch) {
    var key_cb;
    key_cb = route_key();
    return function(arg) {
      var key, key_func, nomatch_func, route_func;
      key = null;
      key_func = key_cb();
      nomatch_func = null;
      route_func = null;
      return function(data) {
        var k, key_str, result, v;
        if (nomatch_func) {
          return nomatch_func(data);
        } else if (!route_func) {
          key = key_func(data);
          if (typeof key === 'undefined') return;
          key_str = key.toString('ascii');
          if (routes[key_str]) {
            route_func = routes[key_str](arg);
          } else if (typeof routes[key] === 'undefined') {
            if (nomatch) {
              nomatch_func = nomatch(key);
            } else {
              err(data, 'route', ("key " + key_str + " is not a valid route in ") + ((function() {
                var _results;
                _results = [];
                for (k in routes) {
                  if (!__hasProp.call(routes, k)) continue;
                  v = routes[k];
                  _results.push(k);
                }
                return _results;
              })()));
            }
          } else {
            return [key, null];
          }
        } else if (route_func) {
          result = route_func(data);
          if (typeof result !== 'undefined') return [key, result];
        }
      };
    };
  };

  series = function(parts, ids) {
    return function(arg) {
      var handler, i, ret;
      i = 0;
      handler = parts[i](arg);
      ret = [];
      return function(data) {
        var j, result, _i, _len, _results;
        result = handler(data);
        if (typeof result === 'undefined') return;
        ret.push(result);
        i += 1;
        if (parts.length === i) {
          if (typeof ids === 'undefined') {
            return ret;
          } else if (typeof ids === 'number') {
            return ret[ids];
          } else {
            _results = [];
            for (_i = 0, _len = ids.length; _i < _len; _i++) {
              j = ids[_i];
              _results.push(ret[j]);
            }
            return _results;
          }
        }
        handler = parts[i](arg);
      };
    };
  };

  zip = function(keys, cb) {
    return onres(cb, function(result) {
      var i, k, ret, _len;
      ret = {};
      for (i = 0, _len = keys.length; i < _len; i++) {
        k = keys[i];
        if (k) ret[k] = result[i];
      }
      return ret;
    });
  };

  onres = function(cb, res_cb) {
    return function() {
      var args, handler;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      handler = cb.apply(null, args);
      return function(data) {
        var result;
        result = handler(data);
        if (typeof result === 'undefined') return;
        return res_cb.apply(null, [result].concat(__slice.call(args)));
      };
    };
  };

  l = function(data) {
    console.log(data.buf.slice(data.pos));
    return console.log(data.buf.toString('utf8', data.pos));
  };

  greeting = greeting();

  response = response();

  command = function() {
    var cb, cmd, copy, fetch, search, store;
    copy = series([sp(), seq_set(), sp(), mailbox()], [1, 3]);
    fetch = series([sp(), seq_set(), sp(), fetch_attributes()], [1, 3]);
    search = series([sp(), search_args()], 1);
    store = series([sp(), seq_set(), sp(), store_att_flags()], [1, 3]);
    cmd = route({
      "CAPABILITY": null,
      "LOGOUT": null,
      "NOOP": null,
      "APPEND": append_args(),
      "CREATE": series([sp(), mailbox()], 1),
      "DELETE": series([sp(), mailbox()], 1),
      "EXAMINE": series([sp(), mailbox()], 1),
      "LIST": series([sp(), mailbox(), sp(), list_mailbox()], [1, 3]),
      "LSUB": series([sp(), mailbox(), sp(), list_mailbox()], [1, 3]),
      "RENAME": series([sp(), mailbox(), sp(), mailbox()], [1, 3]),
      "SELECT": series([sp(), mailbox()], 1),
      "STATUS": series([sp(), mailbox(), sp(), paren_wrap(space_list(status_att()))], [1, 3]),
      "SUBSCRIBE": series([sp(), mailbox()], 1),
      "UNSUBSCRIBE": series([sp(), mailbox()], 1),
      "LOGIN": series([sp(), userid(), sp(), password()], [1, 3]),
      "AUTHENTICATE": series([sp(), auth_type()], 1),
      "STARTTLS": null,
      "CHECK": null,
      "CLOSE": null,
      "EXPUNGE": null,
      "COPY": copy,
      "FETCH": fetch,
      "STORE": store,
      "SEARCH": search,
      "UID": series([
        sp(), route({
          "COPY": copy,
          "FETCH": fetch,
          "SEARCH": search,
          "STORE": store
        })
      ], 1),
      "X": x_command()
    });
    cb = series([tag(), sp(), cmd, crlf()]);
    return onres(cb, function(result) {
      return {
        tag: result[0].toString(),
        command: result[2][0].toString(),
        args: result[2][1]
      };
    });
  };

  search_args = function() {
    var c, h, hascharset, nocharset;
    c = 'C'.charCodeAt(0);
    h = 'H'.charCodeAt(0);
    nocharset = space_list(search_key());
    hascharset = series([str('CHARSET', true), sp(), astring(), sp(), nocharset], [0, 2, 4]);
    return function() {
      var handler, i;
      i = 0;
      handler = null;
      return function(data) {
        var code, _i, _len, _ref;
        if (!handler) {
          _ref = data.buf.slice(data.pos);
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            code = _ref[_i];
            if (i === 0 && code !== c) {
              handler = nocharset();
              break;
            } else if (i === 1 && code !== h) {
              handler = nocharset();
              handler({
                pos: 0,
                buf: new Buffer('C')
              });
              break;
            } else if (i === 2) {
              handler = hascharset();
              handler({
                pos: 0,
                buf: new Buffer('CH')
              });
              break;
            }
            i += 1;
            data.pos += 1;
          }
        }
        if (handler) return handler(data);
      };
    };
  };

  date = function() {
    return starts_with('"', wrap('"', '"', date_text()), date_text());
  };

  flag_keyword = function() {
    return atom();
  };

  search_key = cache(function() {
    var keys, list, num, paren;
    keys = route({
      "ALL": null,
      "ANSWERED": null,
      "BCC": series([sp(), astring()], 1),
      "BEFORE": series([sp(), date()], 1),
      "BODY": series([sp(), astring()], 1),
      "CC": series([sp(), astring()], 1),
      "DELETED": null,
      "FLAGGED": null,
      "FROM": series([sp(), astring()], 1),
      "KEYWORD": series([sp(), flag_keyword()], 1),
      "NEW": null,
      "OLD": null,
      "ON": series([sp(), date()], 1),
      "RECENT": null,
      "SEEN": null,
      "SINCE": series([sp(), date()], 1),
      "SUBJECT": series([sp(), astring()], 1),
      "TEXT": series([sp(), astring()], 1),
      "TO": series([sp(), astring()], 1),
      "UNANSWERED": null,
      "UNDELETED": null,
      "UNFLAGGED": null,
      "UNKEYWORD": series([sp(), flag_keyword()], 1),
      "UNSEEN": null,
      "DRAFT": null,
      "HEADER": series([sp(), header_fld_name(), sp(), astring()], [1, 3]),
      "LARGER": series([sp(), number()], 1),
      "NOT": series([sp(), search_key()], 1),
      "OR": series([sp(), search_key(), sp(), search_key()], [1, 3]),
      "SENTBEFORE": series([sp(), date()], 1),
      "SENTON": series([sp(), date()], 1),
      "SENTSINCE": series([sp(), date()], 1),
      "SMALLER": series([sp(), number()], 1),
      "UID": series([sp(), seq_set()], 1),
      "UNDRAFT": null
    });
    list = paren_wrap(space_list(search_key()));
    num = seq_set();
    paren = '('.charCodeAt(0);
    return function() {
      var handler;
      handler = null;
      return function(data) {
        var _i, _ref, _results;
        if (!handler) {
          if (_ref = data.buf[data.pos], __indexOf.call((function() {
            _results = [];
            for (var _i = 0x30; 0x30 <= 0x39 ? _i <= 0x39 : _i >= 0x39; 0x30 <= 0x39 ? _i++ : _i--){ _results.push(_i); }
            return _results;
          }).apply(this), _ref) >= 0) {
            handler = num();
          } else if (data.buf[data.pos] === paren) {
            handler = list();
          } else {
            handler = keys();
          }
        }
        return handler(data);
      };
    };
  });

  userid = function() {
    return astring();
  };

  password = function() {
    return astring();
  };

  auth_type = function() {
    return atom();
  };

  list_mailbox = function() {
    return lookup({
      '"': string(),
      "{": string(),
      '': list_char_str()
    });
  };

  store_att_flags = function() {
    return zip(['op', 'silent', null, 'flags'], series([oneof(['+FLAGS', '-FLAGS', 'FLAGS'], false, true), ifset('.', str('.SILENT', true)), sp(), starts_with('(', flag_list(), space_list(flag()))]));
  };

  seq_set = function() {
    return comma_list(seq_item());
  };

  seq_item = function() {
    var cb, num;
    num = seq_num();
    cb = series([num, ifset(':', series([str(':'), num], 1))]);
    return onres(cb, function(result) {
      if (!result[1]) result.pop();
      return result;
    });
  };

  seq_num = function() {
    var num, star;
    num = number(true);
    star = '*'.charCodeAt(0);
    return function() {
      var handler;
      handler = null;
      return function(data) {
        if (!handler) {
          if (data.buf[data.pos] === star) {
            return data.buf.slice(data.pos, (data.pos + 1));
          } else {
            handler = num();
          }
        }
        return handler(data);
      };
    };
  };

  fetch_attributes = function() {
    return starts_with('(', paren_wrap(space_list(fetch_att())), fetch_att());
  };

  fetch_att = function() {
    var body_section;
    body_section = series([section(), ifset('<', subsection())]);
    return route({
      "ALL": null,
      "FULL": null,
      "FAST": null,
      "ENVELOPE": null,
      "FLAGS": null,
      "INTERNALDATE": null,
      "RFC822": null,
      "RFC822.HEADER": null,
      "RFC822.TEXT": null,
      "RFC822.SIZE": null,
      "BODY": ifset('[', body_section),
      "BODYSTRUCTURE": null,
      "BODY.PEEK": body_section,
      "UID": null
    });
  };

  subsection = function() {
    return series([str('<'), number(), str('.'), number(true), str('>')]);
  };

  append_args = function() {
    return series([sp(), mailbox(), sp(), ifset('(', series([flag_list(), sp()], 1)), ifset('"', series([date_time(), sp()], 1)), literal_size()], [1, 3, 4, 5]);
  };

  x_command = function() {
    return function() {
      return function(data) {};
    };
  };

  command = command();

}).call(this);
