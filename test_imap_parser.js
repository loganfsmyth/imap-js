
var ImapParser = require('./imap_parser').ImapParser;


var p = new ImapParser();

var b = new Buffer('HI THERE');

console.log(p.execute(b, 0, 5));
