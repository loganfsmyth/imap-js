
var ImapParserNative = require('./imap_parser_native');

var ImapParser = module.exports.ImapParser = function(type) {
  var parser = new (ImapParserNative.ImapParser)(type);

  var buffers = [];
  var buffer_length = 0;
  var response = {};
  var done = false;

  parser.onData = function(b, start, len, type) {
    if (type == ImapParserNative.IMAP_NONE) {
      buffers.push({
        buf: b,
        start: start,
        len: len,
      });
      buffer_length += len;
      return;
    }
    var data;
    if (buffers.length) {
      // If there are several buffers, then we
      // append them all together in a new buffer
      data = new Buffer(buffer_length + len);
      var pos = 0;
      for (var i in buffers) {
        var info = buffers[i];
        info.buf.copy(data, pos, info.start, info.start + info.len);
        pos += info.len;
      }
      if (len > 0) {
        b.copy(data, pos, start, start + len);
      }
      buffers = [];
      buffer_length = 0;
    }
    else {
      // fast since references same memory
      data = b.slice(start, start + len);
    }

    var ipn = ImapParserNative;
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
    }

    console.log('Data: ' + value);
  };
  parser.onDone = function(type) {
    for(var i in ImapParserNative) {
      if (type == ImapParserNative[i]) {
        console.log('Done: ' + i);
      }
    }
    if (type == ImapParserNative.IMAP_RESPONSE) {
      done = true;
    }
  };

  parser.onStart = function(type) {
    for(var i in ImapParserNative) {
      if (type == ImapParserNative[i]) {
        console.log('Start: ' + i);
      }
    }
    if (type == ImapParserNative.IMAP_RESPONSE) {
      done = true;
    }
  };

  this.isDone = function() {
    return done;
  };

  this.execute = function(b) {
    console.log('Parsing: ' + b.toString('utf8'));
    try {
      parser.execute(b, 0, b.length);
    }
    catch (e) {
      buffers = [];
      buffer_length = 0;
      response = {};
      console.log(e);
      throw e;
    }
  };
  this.reinitialize = function(type) {
    buffers = [];
    buffer_length = 0;
    response = {};
    done = false;

//    console.log("REINITIALIZE");
    return parser.reinitialize(type);
  }
};


['PARSER_GREETING', 'PARSER_RESPONSE', 'PARSER_COMMAND'].forEach(function(val) {
  ImapParser[val.replace(/PARSER_/, '')] = ImapParserNative[val];
});
