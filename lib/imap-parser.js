
var ImapParserNative = require('./imap_parser_native').ImapParser;

var ImapParser = module.exports.ImapParser = function() {
  var parser = new ImapParserNative();

  parser.onData = function(b, start, len) {
//    console.log(start + ' - ' + len);
    console.log("Data:\n==" + b.toString('utf8', start, start + len));
  };
  parser.onNumber = function(num) {
    console.log("Num:\n==" + num);
  };
  parser.onDone = function(type) {
    console.log("Type:\n==" + type);
  };
  this.execute = function(b) {
    console.log('Parsing: ' + b.toString('utf8'));
    return parser.execute(b, 0, b.length);
  };
  this.reinitialize = function() {
    return parser.reinitialize();
  }
}
