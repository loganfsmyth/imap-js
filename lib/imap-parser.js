
var ipn = require('./imap_parser_native');
var util = require('util');
var Iconv = require('iconv').Iconv;

var ic = new Iconv('UTF-7', 'UTF-8');

var ImapParser = module.exports.ImapParser = function(type) {
  var self = this;
  self.parser = new (ipn.ImapParser)(type);
  self.reinitialize(type);

  self.parser.onData = function(b, start, len, type) {
    return self.onParserData(b, start, len, type);
  }
  self.parser.onDone = function(type) {
    return self.onParserDone(type);
  }
  self.parser.onStart = function(type) {
    return self.onParserStart(type);
  }
}

ImapParser.prototype.reinitialize = function(type) {
  this.buffers = [];
  this.buffer_length = 0;
  this.values = [];
  this.parser.reinitialize(type);
}

ImapParser.prototype.execute = function(b) {
//  console.log('Parsing: ' + b.toString('utf8'));
  this.parser.execute(b, 0, b.length);
}


ImapParser.prototype._modifiedUtf7ToUtf8 = function(data) {
  var result = '';
  var start = -1;
  for (var i = 0, len = data.length; i < len; i++) {
    if (data[i] == '-') {
      if (start >= 0) {
        if (i-start == 0) {
          result += '&';
        }
        else {
          result += ic.convert(data.slice(start, i+1).replace('&', '+').replace(',', '/'));
        }
        start = -1;
      }
      else {
        result += '-';
      }
    }
    else if (start >= 0) {
      // nothing
    }
    else if (data[i] == '&') {
      start = i;
    }
    else {
      result += data[i];
    }
  }
  return result;
}



ImapParser.prototype.onParserStart = function(type) {
  for(var i in ipn) {
    if (type == ipn[i]) {
//      console.log('Start: ' + i);
    }
  }
  switch (type) {
    case ipn.IMAP_COMMAND_RESPONSE:
    case ipn.IMAP_GREETING_RESPONSE:
    case ipn.IMAP_UNTAGGED_RESPONSE:
    case ipn.IMAP_CONTINUE_RESPONSE:
    case ipn.IMAP_TAGGED_RESPONSE:
    case ipn.IMAP_LIST:
    case ipn.IMAP_RESP_TEXT:
    case ipn.IMAP_MSG_ATT:
    case ipn.IMAP_BODY:
    case ipn.IMAP_ENVELOPE:
    case ipn.IMAP_ADDRESS:
    case ipn.IMAP_SECTION:
    case ipn.IMAP_KEYVALUE:
      this.values.push([]);
      break;
  }
}

ImapParser.prototype.onParserDone = function(type) {
  for(var i in ipn) {
    if (type == ipn[i]) {
//      console.log('Done: ' + i);
    }
  }

  var v = this.values.pop();
  switch (type) {
    case ipn.IMAP_COMMAND_RESPONSE:
      break;
    case ipn.IMAP_GREETING_RESPONSE:
      if (this.onGreeting) {
        this.onGreeting(this.zip(['type', 'text'], v));
      }
      break;
    case ipn.IMAP_UNTAGGED_RESPONSE:
      var o;
      switch(v[0]) {
        case 'OK':
        case 'BYE':
        case 'BAD':
        case 'NO':
          o = ['type', 'text'];
          break;
        case 'CAPABILITY':
        case 'FLAGS':
          o = ['type', 'value'];
          break;
        case 'LIST':
        case 'LSUB':
          o = ['type', 'list-flags', 'delim', 'mailbox'];
          v[3] = this._modifiedUtf7ToUtf8(v[3]);
          break;
        case 'SEARCH':
          o = ['type'];
          if (v.length > 1) {
            o.push('value');
          }
          break;
        case 'STATUS':
          o = ['type', 'mailbox', 'attrs'];
          break;
        default:
          o = ['value', 'type'];
          if (v[1] == 'FETCH') {
            o.push('msg-att');
          }
          break;
      }
      var response = this.zip(o,v);
      if (this.onUntagged) {
        this.onUntagged(response);
      }
      break;
    case ipn.IMAP_CONTINUE_RESPONSE:
      var o;
      if (Buffer.isBuffer(v[0])) {
        o = ['base64'];
      }
      else {
        o = ['text'];
      }
      var response = this.zip(o, v);
      if (this.onContinuation) {
        this.onContinuation(response);
      }
      break;
    case ipn.IMAP_TAGGED_RESPONSE:
      o = ['tag', 'type', 'text'];
      var response = this.zip(o, v);
      if (this.onTagged) {
        this.onTagged(response);
      }
      break;
    case ipn.IMAP_LIST:
      this.values[this.values.length-1].push(v);
      break;
    case ipn.IMAP_KEYVALUE:
      // Convert ['one', 2, 'two', 34] to {one: 2, two:34}
      var kv = {};
      for (var i = 0, l = v.length; i < l; i += 2) {
        kv[v[i]] = v[i+1];
      }
      this.values[this.values.length-1].push(kv);
      break;
    case ipn.IMAP_RESP_TEXT:
      var o = [ 'text' ];
      if (typeof v[0] == 'object') {
        v[0] = this.zip([ 'type', 'value' ], v[0]);
        o.unshift('code');
      }
      this.values[this.values.length-1].push(this.zip(o, v));
      break;
    case ipn.IMAP_MSG_ATT:
      switch (v[0]) {
        case 'BODY':
          if (v.length > 2) {
            o = ['name', 'section'];
            if (v.length > 3) {
              o.push('number');
            }
            o.push('value');
            break;
          }
        case 'RFC822':
        case 'RFC822.HEADER':
        case 'RFC822.TEXT':
        case 'RFC822.SIZE':
        case 'ENVELOPE':
        case 'FLAGS':
        case 'INTERNALDATE':
        case 'UID':
        case 'BODYSTRUCTURE':
          o = ['name', 'value'];
          break;
      }
      this.values[this.values.length-1].push(this.zip(o, v));
      break;
    case ipn.IMAP_BODY:
      var o;
      if (typeof v[0] == 'string') {
        o = ['type', 'subtype', 'fld-param', 'fld-id', 'fld-desc', 'fld-enc', 'fld-octets'];
        if (v[0] == 'MESSAGE' && v[1] == 'RFC822') { // media-message
          o = o.concat(['envelope', 'body', 'fld-lines']);
        }
        else if (v[0] == 'TEXT') {  // media-text
          o.push('fld-lines');
        }
        else {    // media-basic
        }
        if (v.length > o.length) {
          o = o.concat(['fld-md5', 'fld-dsp', 'fld-lang', 'fld-loc', 'body-extensions']);
        }
      }
      else {
        o = ['bodies', 'subtype'];
        if (v.length > 2) {
          o = o.concat(['fld-param', 'fld-dsp', 'fld-lang', 'fld-loc', 'body-extensions']);
        }
      }
      this.values[this.values.length-1].push(this.zip(o, v));
      break;
    case ipn.IMAP_ENVELOPE:
      o = ['date', 'subject', 'from', 'sender', 'reply-to', 'to', 'cc', 'bcc', 'in-reply-to', 'message-id'];
      this.values[this.values.length-1].push(this.zip(o, v));
      break;
    case ipn.IMAP_ADDRESS:
      o = ['name', 'adl', 'mailbox', 'host'];
      this.values[this.values.length-1].push(this.zip(o, v));
      break;
    case ipn.IMAP_SECTION:
      var section = v.pop();
      var sec = {};
      if (typeof section == 'object') {
        sec.spec = v.join('.');
        sec.headers = section;
      }
      else {
        v.push(section);
        sec.spec = v.join('.');
      }
      this.values[this.values.length-1].push(sec);
      break;
  }
}

ImapParser.prototype.zip = function(keys, vals) {
  var o = {};
  var vl = vals.length;
  for (var i = 0, l = keys.length; i < l; i++) {
    if (typeof keys[i] != 'undefined' && i < vl) {
      o[keys[i]] = vals[i];
    }
  }
  return o;
}

/**
 * When the parser returns data, it may or may not be completed done
 * This keeps a list of buffers and when all the data has arrives, concatenates
 * the buffers and triggers a data callback
 */
ImapParser.prototype.onParserData = function(b, start, len, type) {
//  console.log('pData: ' + b.toString('utf8', start, start+len) + ' : ' + start + '-' + (start+len));
  if (type == ipn.IMAP_NONE) {
    this.buffers.push({
      buf: b,
      start: start,
      len: len,
    });
    this.buffer_length += len;
    return;
  }
  var data;
  if (this.buffers.length) {
    // If there are several buffers, then we
    // append them all together in a new buffer
    data = new Buffer(this.buffer_length + len);
    var pos = 0, info;
    for (var i = 0, l = this.buffers.length; i < l; i++) {
      info = this.buffers[i];
      info.buf.copy(data, pos, info.start, info.start + info.len);
      pos += info.len;
    }
    if (len > 0) {
      b.copy(data, pos, start, start + len);
    }
    this.buffers = [];
    this.buffer_length = 0;
  }
  else {
    // fast since references same memory
    data = b.slice(start, start + len);
  }

  var value = '';
  switch (type) {
    case ipn.IMAP_ATOM:
    case ipn.IMAP_LITERAL:
    case ipn.IMAP_ASTRING:
    case ipn.IMAP_TEXT:
      value = data.toString('utf8');
      break;
    case ipn.IMAP_QUOTED:
      value = data.toString('utf8').replace("\\\\", "\\").replace("\\\"", "\"");
      break;
    case ipn.IMAP_NUMBER:
      value = parseInt(data.toString('utf8'), 10);
      break;

    case ipn.IMAP_TEXT_OR_BASE64:
      var value = data.toString('utf8');
      if (value.match(/=[^=$]|===?$/)) {
        break;
      }
    case ipn.IMAP_BASE64:
      value = new Buffer(value, 'base64');
      break;
    case ipn.IMAP_DATETIME:
      value = new Date(data.toString('ascii'));
      break;
    case ipn.IMAP_NIL:
      value = null;
      break;
    case ipn.IMAP_LITERAL_SIZE:
      return;
      break;
    default:
      throw new Error("Unexpected datatype encountered: " + type);
      break;
  }
//  console.log('Data: ' + value);
  this.values[this.values.length-1].push(value);
};

['PARSER_GREETING', 'PARSER_RESPONSE', 'PARSER_COMMAND'].forEach(function(val) {
  ImapParser[val.replace(/PARSER_/, '')] = ipn[val];
});
