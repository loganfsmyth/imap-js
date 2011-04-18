
var ipn = require('./imap_parser_native');
var util = require('util');

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
  this.done = false;
  this.parser.reinitialize(type);
}

ImapParser.prototype.execute = function(b) {
  console.log('Parsing: ' + b.toString('utf8'));
  this.parser.execute(b, 0, b.length);
}

ImapParser.prototype.isDone = function() {
  return this.done;
}

ImapParser.prototype.onParserStart = function(type) {
  for(var i in ipn) {
    if (type == ipn[i]) {
      console.log('Start: ' + i);
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
      this.values.push([]);
      break;
  }
}

ImapParser.prototype.onParserDone = function(type) {
  for(var i in ipn) {
    if (type == ipn[i]) {
      console.log('Done: ' + i);
    }
  }
  if (type == ipn.IMAP_COMMAND_RESPONSE || type == ipn.IMAP_GREETING_RESPONSE || type == ipn.IMAP_UNTAGGED_RESPONSE || 
      type == ipn.IMAP_TAGGED_RESPONSE || type == ipn.IMAP_CONTINUE_RESPONSE) {
    this.done = true;
  }

  var v = this.values.pop();
  switch (type) {
    case ipn.IMAP_COMMAND_RESPONSE:
    case ipn.IMAP_GREETING_RESPONSE:
      console.log(this.zip(['type', 'resp-text'], v));
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
          o = ['type', 'list-flags', 'char', 'mailbox'];
          break;
        case 'SEARCH':
          o = ['type'];
          if (v.length > 1) {
            o.push('value');
          }
          break;
        case 'STATUS':
          o = ['type', 'mailbox', 'attrs'];

          // Convert ['one', 2, 'two', 34] to {one: 2, two:34}
          var attrs = v[2];
          v[2] = {};
          for (var i = 0, l = attrs.length; i < l; i += 2) {
            v[2][attrs[i]] = attrs[i+1];
          }
          break;
        default:
          o = ['value', 'type'];
          if (v[1] == 'FETCH') {
            o.push('msg-att');
          }
          break;
      }
      console.log(util.inspect(this.zip(o, v), false, 12));
      break;
    case ipn.IMAP_CONTINUE_RESPONSE:
      var o;
      if (Buffer.isBuffer(v[0])) {
        o = this.zip(['base64'], v);
      }
      else {
        o = this.zip(['resp-text'], v);
      }
      console.log(o);
      break;
    case ipn.IMAP_TAGGED_RESPONSE:
      console.log(this.zip(['tag', 'type', 'resp-text'], v));
      break;
    case ipn.IMAP_LIST:
      this.values[this.values.length-1].push(v);
      break;
    case ipn.IMAP_RESP_TEXT:
      var o = [];
      o.unshift('text');
      if (v.length > 1) {
        if (v.length > 2) {
          o.unshift('value');
        }
        o.unshift('code');
      }
      this.values[this.values.length-1].push(this.zip(o, v));
      break;
    case ipn.IMAP_MSG_ATT:
//      console.log(util.inspect(v, false, 12));
//      console.log(this.values.length);
      switch (v[0]) {
        case 'BODY':
          if (v.length > 2) {
            o = ['name', 'section'];
            var section = v[1][v[1].length-1];
            var sec = {};
            if (typeof section == 'object') {
              sec.spec = v[1].slice(0, -1).join('.');
              sec.headers = section;
            }
            else {
              sec.spec = v[1].join('.');
            }
            v[1] = sec;
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
//      console.log(util.inspect(v, false, 12));
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
  console.log('Data: ' + value);
  this.values[this.values.length-1].push(value);
};

['PARSER_GREETING', 'PARSER_RESPONSE', 'PARSER_COMMAND'].forEach(function(val) {
  ImapParser[val.replace(/PARSER_/, '')] = ipn[val];
});
