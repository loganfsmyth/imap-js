
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
    switch (type) {
      case ipn.IMAP_TAG:
        response.tag = data.toString('ascii');
        break;
      case ipn.IMAP_STATE:
        response.state = data.toString('ascii');
        break;
      case ipn.IMAP_CAPABILITY:
        response.capabilities = response.capabilities || [];
        response.capabilities.push(data.toString('ascii'));
        break;
      case ipn.IMAP_TEXT:
        response.text = data.toString('ascii');
        break;
      case ipn.IMAP_QUOTED:
        response.quoted = data.toString('ascii').replace("\\\\", "\\").replace("\\\"", "\"");
        break;
      case ipn.IMAP_LITERAL:
      
        break;
      case ipn.IMAP_FLAG:
        break;
      case ipn.IMAP_TEXTCODE:
        break;
      case ipn.IMAP_ASTRING:
        break;
      case ipn.IMAP_NUMBER:
        break;
      case ipn.IMAP_BASE64:
        response.base64 = data.toString('ascii');
      case ipn.IMAP_TEXT_OR_BASE64:
        var str = data.toString('utf8');
        if (str.match(/=[^=$]|===?$/)) {
          response.text = str;
        }
        else {
          response.base64 = (new Buffer(str, 'base64')).toString('utf8');
        }
        break;
    }

    console.log("Data " + type + " ===> " + data.toString('utf8'));

  };
  parser.onDone = function(type) {
      console.log('>>>>DONE');
    if (type == ImapParserNative.IMAP_RESPONSE) {
      console.log("--------DONE--------\n", response, "\n-------------------------");
      done = true;
    }
    else {

      var i = ImapParserNative;
      switch(type) {
        case i.IMAP_NIL:
          console.log('NIL');

      }

    }
  };

  this.isDone = function() {  return done; };

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

    console.log("REINITIALIZE");
    return parser.reinitialize(type);
  }
};


['PARSER_GREETING', 'PARSER_RESPONSE', 'PARSER_COMMAND'].forEach(function(val) {
  ImapParser[val.replace(/PARSER_/, '')] = ImapParserNative[val];
});
