(function() {
  var Parser, Stream, SyntaxError, addr_adl, addr_host, addr_mailbox, addr_name, address, astring, astring_chars, astring_str, atom, atom_chars, atom_specials, body, body_ext_1part, body_ext_mpart, body_extension, body_fld_dsp, body_fld_lang, body_fld_loc, body_fld_md5, body_fld_param, body_type_1part, body_type_mpart, bracket_wrap, cache, capability, capability_args, capability_data, collect_until, collector, continue_req, crlf, ctl, curly_wrap, date_time, digits, empty_resp, env_bcc, env_cc, env_date, env_from, env_in_reply_to, env_message_id, env_reply_to, env_sender, env_subject, env_to, envelope, err, flag, flag_list, greeting, header_fld_name, header_list, ifset, join, l, list_wildcards, literal, literal_data, literal_size, lookup, mailbox, mailbox_list, mbx_list_flags, media_subtype, msg_att, nil, nosep_list, nstring, null_resp, number, oneof, onres, opt, paren_wrap, quoted, quoted_char, quoted_char_inner, quoted_inner, quoted_specials, resp_specials, resp_text_code, response, response_data_types, response_numeric_types, response_tagged, response_untagged, route, route_key, section, section_msgtext, section_parts, section_spec, series, sp, space_list, starts_with, status_att_list, str, string, tag, text, text_chars, text_code, textchar_str, time, uniqueid, wrap, zip, zone,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; },
    __indexOf = Array.prototype.indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; },
    __slice = Array.prototype.slice;

  Stream = require('stream');

  module.exports = Parser = (function(_super) {
    var CLIENT, SERVER;

    __extends(Parser, _super);

    Parser.CLIENT = CLIENT = 0x01;

    Parser.SERVER = SERVER = 0x02;

    Parser.createParser = function(type, cbs) {
      var cb, event, p;
      p = new Parser(type);
      if (typeof cbs === 'function') {
        p.on('greeting', cbs);
      } else if (cbs) {
        for (event in cbs) {
          if (!__hasProp.call(cbs, event)) continue;
          cb = cbs[event];
          p.on(event, cb);
        }
      }
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
      };
    };

    Parser.prototype.write = function(buffer, encoding) {
      var data;
      if (!Buffer.isBuffer(buffer)) buffer = new Buffer(buffer, encoding);
      this.writing = true;
      data = {
        buf: buffer,
        pos: 0
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
      context = 10;
      this.name = "IMAPSyntaxError";
      pos = data.pos, buf = data.buf;
      start = Math.max(pos - context, 0);
      end = Math.min(pos + context, buf.length);
      error = pos - start;
      this.message = rule + (extra && "\n" + extra) + "\n" + "==" + buf.toString('utf8', start, end) + "==\n" + "  " + ((function() {
        var _results;
        _results = [];
        for (i = 0; 0 <= pos ? i < pos : i > pos; 0 <= pos ? i++ : i--) {
          _results.push(" ");
        }
        return _results;
      })()).join('') + "^\n";
    }

    return SyntaxError;

  })(Error);

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
    return zip([null, 'type', null, 'text-code', 'text'], series([str('* '), oneof(['OK', 'PREAUTH', 'BYE']), sp(), ifset('[', text_code()), text(), crlf()]));
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
    cb = series([tag(), sp(), oneof(['OK', 'NO', 'BAD']), sp(), ifset('[', text_code()), text(), crlf()]);
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
            'value': result[1],
            'id': parseInt(result[2], 10)
          };
      }
    });
  };

  response_numeric_types = function() {
    var cb, types;
    types = route({
      'EXISTS': null,
      'RECENT': null,
      'EXPUNGE': null,
      'FETCH': series([sp(), msg_att()], 1)
    });
    cb = series([sp(), types], 1);
    return onres(cb, function(result, num) {
      var _ref;
      if (((_ref = result[0].toString()) === 'EXPUNGE' || _ref === 'FETCH') && num[0] === 0x30) {
        err({
          pos: 0,
          buf: new Buffer(0)
        }, 'response_numeric', 'FETCH and EXPUNGE ids must be positive');
      }
      result.push(num);
      return result;
    });
  };

  sp = cache(function() {
    return str(' ');
  });

  text_code = cache(function() {
    return series([bracket_wrap(resp_text_code()), sp()], 0);
  });

  msg_att = function() {
    var body_section_data, body_struc, rfc_text;
    body_struc = series([sp(), body()], 1);
    rfc_text = series([sp(), nstring()], 1);
    body_section_data = zip(['section', 'partial', null, 'value'], series([section(), starts_with('<', wrap('<', '>', number()), null_resp()), sp(), nstring()]));
    return paren_wrap(space_list(zip(['type', 'value'], route({
      'FLAGS': series([sp(), paren_wrap(space_list(flag(false), true))], 1),
      'ENVELOPE': series([sp(), envelope()], 1),
      'INTERNALDATE': series([sp(), date_time()], 1),
      'RFC822': rfc_text,
      'RFC822.HEADER': rfc_text,
      'RFC822.TEXT': rfc_text,
      'RFC822.SIZE': series([sp(), number()], 1),
      'BODYSTRUCTURE': body_struc,
      'BODY': starts_with(' ', body_struc, body_section_data),
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

  date_time = function() {
    var cb;
    cb = join(series([
      str('"'), starts_with(' ', series([sp(), digits(1)]), digits(2)), str('-'), onres(oneof(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']), function(result) {
        return new Buffer(result);
      }), str('-'), digits(4), sp(), time(), sp(), zone(), str('"')
    ], [1, 2, 3, 4, 5, 6, 7, 8, 9]));
    return onres(cb, function(result) {
      return new Date(result);
    });
  };

  time = function() {
    return join(series([digits(2), str(':'), digits(2), str(':'), digits(2)]));
  };

  zone = function() {
    return join(series([
      onres(oneof(['-', '+']), function(res) {
        return new Buffer(res);
      }), digits(4)
    ]));
  };

  nstring = cache(function() {
    return starts_with('N', nil(), string());
  });

  address = function() {
    var cb;
    cb = paren_wrap(series([addr_name(), sp(), addr_adl(), sp(), addr_mailbox(), sp(), addr_host()]));
    return zip(['name', null, 'adl', null, 'mailbox', null, 'host'], cb);
  };

  addr_name = addr_adl = addr_mailbox = addr_host = function() {
    return nstring();
  };

  digits = function(num) {
    return collect_until(function() {
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
  };

  body_ext_mpart = function() {
    return zip(['param', 'dsp', 'lang', 'loc', 'ext'], series([body_fld_param(), ifset(' ', series([sp(), body_fld_dsp()], 1)), ifset(' ', series([sp(), body_fld_lang()], 1)), ifset(' ', series([sp(), body_fld_loc()], 1)), ifset(' ', series([sp(), body_extension()], 1))]));
  };

  body_ext_1part = function() {
    return series([body_fld_md5(), ifset(' ', series([sp(), body_fld_dsp()], 1)), ifset(' ', series([sp(), body_fld_lang()], 1)), ifset(' ', series([sp(), body_fld_loc()], 1)), ifset(' ', series([sp(), body_extension()], 1))]);
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
    return series([
      nosep_list(function() {
        return body()();
      }), sp(), media_subtype(), ifset(' ', series([sp(), body_ext_mpart()], 1))
    ], [0, 2, 3]);
  };

  body_type_1part = function() {
    var cb;
    cb = series([string(), sp(), media_subtype(), ifset(' ', series([sp(), body_ext_1part()], 1))]);
    return onres(cb, function(result) {
      return {
        'type': result[0],
        'subtype': result[2],
        'md5': result[3] && result[3][0],
        'dsp': result[3] && result[3][1],
        'lang': result[3] && result[3][2],
        'loc': result[3] && result[3][3],
        'ext': result[3] && result[3][4]
      };
    });
  };

  body = cache(function() {
    return paren_wrap(starts_with('(', body_type_mpart(), body_type_1part()));
  });

  section = function() {
    return bracket_wrap(section_spec());
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
    return paren_wrap(space_list(flag(), true));
  };

  mailbox_list = function() {
    return zip(['flags', null, 'char', null, 'mailbox'], series([paren_wrap(mbx_list_flags()), sp(), starts_with('"', quoted_char(), nil()), sp(), mailbox()]));
  };

  mbx_list_flags = function() {
    return space_list(join(series([str('\\'), atom()])), true);
  };

  nil = cache(function() {
    return onres(str('NIL'), function(result) {
      return null;
    });
  });

  quoted_char = function() {
    return wrap('"', '"', quoted_char_inner());
  };

  quoted_char_inner = function() {
    var chars, quote, slash;
    quote = '"'.charCodeAt(0);
    slash = '\\'.charCodeAt(0);
    chars = text_chars();
    return function() {
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
  };

  mailbox = cache(function() {
    return astring();
  });

  status_att_list = function() {
    var status_att_pair;
    status_att_pair = series([oneof(['MESSAGES', 'RECENT', 'UIDNEXT', 'UIDVALIDITY', 'UNSEEN']), sp(), number()], [0, 2]);
    return space_list(status_att_pair, true);
  };

  tag = function() {
    var chars;
    chars = astring_chars();
    return collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (__indexOf.call(chars, code) < 0) return i;
        }
      };
    });
  };

  resp_text_code = function() {
    var atom_args, badcharset_args, permanentflags_args, space_num, text_codes;
    space_num = series([sp(), number(true)], 1);
    badcharset_args = series([sp(), paren_wrap(space_list(astring()))], 1);
    permanentflags_args = series([sp(), paren_wrap(space_list(flag(true), true))], 1);
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

  string = cache(function() {
    return lookup({
      '{': literal(),
      '"': quoted(),
      '': function() {
        return function(data) {
          return err(data, 'string', 'Expected a { or " at the start of the string.');
        };
      }
    });
  });

  quoted = cache(function() {
    return wrap('"', '"', quoted_inner());
  });

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
          col(data.buf.slice(data.pos, (data.pos + i)));
          data.pos += i;
          all = col();
          if (all || none) return all;
          err(data, 'collect_until', 'must have at least one value');
        }
      };
    };
  };

  textchar_str = function() {
    var brac, chars;
    chars = text_chars();
    brac = ']'.charCodeAt(0);
    return collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (__indexOf.call(chars, code) < 0 || code === brac) return i;
        }
      };
    });
  };

  atom = cache(function() {
    var chars;
    chars = atom_chars();
    return collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (__indexOf.call(chars, code) < 0) return i;
        }
      };
    });
  });

  text = cache(function() {
    var cr, lf;
    cr = "\r".charCodeAt(0);
    lf = "\n".charCodeAt(0);
    return collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (code === cr || code === lf) return i;
        }
      };
    });
  });

  quoted_inner = function() {
    var quote, slash;
    slash = '\\'.charCodeAt(0);
    quote = '"'.charCodeAt(0);
    return collect_until(function() {
      var escaped;
      escaped = 0;
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (escaped % 2 === 1 || code === slash) {
            escaped += 1;
            if (code !== slash && code !== quote) {
              err(data, 'quoted_inner', 'Quoted strings can only escape quotes and slashes');
            }
            continue;
          }
          if (code === quote) return i;
        }
      };
    }, true);
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
          size = null;
          dat = literal_dat(length);
        }
        if (nl) {
          result = nl(data);
          if (typeof result === 'undefined') return;
          nl = null;
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
    return collect_until(function(size) {
      var remaining;
      remaining = size;
      return function(data) {
        var buf, code, len, _i, _j, _len, _results;
        len = Math.min(data.buf.length - data.pos, size);
        remaining -= len;
        buf = data.buf.slice(data.pos, (data.pos + len));
        data.pos += len;
        for (_i = 0, _len = buf.length; _i < _len; _i++) {
          code = buf[_i];
          if (__indexOf.call((function() {
            _results = [];
            for (var _j = 0x01; 0x01 <= 0xFF ? _j <= 0xFF : _j >= 0xFF; 0x01 <= 0xFF ? _j++ : _j--){ _results.push(_j); }
            return _results;
          }).apply(this), code) < 0) {
            err(data, 'literal_data', 'Literals can only bytes between 1 and 255');
          }
        }
        if (remaining === 0) return len;
      };
    }, true);
  };

  astring_str = function() {
    var chars;
    chars = astring_chars();
    return collect_until(function() {
      return function(data) {
        var code, i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (i = 0, _len = _ref.length; i < _len; i++) {
          code = _ref[i];
          if (__indexOf.call(chars, code) < 0) return i;
        }
      };
    });
  };

  str = function(s) {
    var buffer;
    buffer = new Buffer(s);
    return function() {
      var i;
      i = 0;
      return function(data) {
        var buf, pos;
        pos = data.pos, buf = data.buf;
        while (pos < buf.length && i < buffer.length) {
          if (buf[pos] !== buffer[i]) err(data, 'str', 'failed to match ' + s);
          i += 1;
          pos += 1;
        }
        data.pos = pos;
        if (i === buffer.length) return buffer;
      };
    };
  };

  collector = function() {
    var buffers, length;
    buffers = [];
    length = 0;
    return function(b) {
      var all, buf, pos, _i, _len;
      if (!b) {
        if (length === 0) return null;
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
    return function() {
      var handler;
      handler = null;
      return function(data) {
        var c;
        if (!handler) {
          c = data.buf[data.pos];
          handler = map[c] ? map[c]() : map[0]();
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
    var close_code;
    if (end_char == null) end_char = ')';
    close_code = end_char.charCodeAt(0);
    return function() {
      var check_done, handler, i, results;
      results = [];
      handler = cb();
      check_done = !!allow_none;
      i = 0;
      return function(data) {
        var result;
        if (check_done) {
          if (data.buf[data.pos] === close_code) return results;
          check_done = false;
        }
        result = handler(data);
        if (typeof result === 'undefined') return;
        results.push(result);
        handler = cb();
        check_done = true;
      };
    };
  };

  space_list = function(cb, none) {
    var paren, spcode;
    spcode = ' '.charCodeAt(0);
    paren = ')'.charCodeAt(0);
    return function() {
      var handler, i, results, space;
      results = [];
      handler = cb();
      space = true;
      i = 0;
      return function(data) {
        var result;
        i += 1;
        if (!results.length) {
          if (i === 1 && none && data.buf[data.pos] === paren) return [];
          result = handler(data);
          if (typeof result === 'undefined') return;
          results.push(result);
          return;
        }
        if (space) {
          if (data.buf[data.pos] !== spcode) return results;
          space = false;
          data.pos += 1;
          handler = cb();
          return;
        }
        result = handler(data);
        if (typeof result === 'undefined') return;
        results.push(result);
        space = true;
      };
    };
  };

  opt = function(c) {
    return starts_with(c, function() {
      return function(data) {
        data.pos += 1;
        return new Buffer(c);
      };
    }, function() {
      return function(data) {
        return new Buffer(0);
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
      var col, data_cb;
      col = collector();
      data_cb = cb();
      return function(data) {
        var b, result, _i, _len;
        result = data_cb(data);
        if (typeof result !== 'undefined') {
          for (_i = 0, _len = result.length; _i < _len; _i++) {
            b = result[_i];
            col(b);
          }
          return col();
        }
      };
    };
  };

  oneof = function(strs, nomatch) {
    return function() {
      var i, matches;
      matches = strs;
      i = 0;
      return function(data) {
        var code, str, _i, _len, _ref;
        _ref = data.buf.slice(data.pos);
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          code = _ref[_i];
          matches = (function() {
            var _j, _len2, _results;
            _results = [];
            for (_j = 0, _len2 = matches.length; _j < _len2; _j++) {
              str = matches[_j];
              if (str[i].charCodeAt(0) === code) _results.push(str);
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
    var dash, dot, lower, nums, upper, _i, _j, _k, _results, _results2, _results3;
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
    return collect_until(function() {
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
  };

  route = function(routes, nomatch) {
    var key_cb;
    key_cb = route_key();
    return function() {
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
            route_func = routes[key_str]();
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
    return function() {
      var handler, i, ret;
      i = 0;
      handler = parts[i]();
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
        handler = parts[i]();
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
      handler = cb();
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

}).call(this);
