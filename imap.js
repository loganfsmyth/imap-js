
var ImapParser = require('./imap_parser').ImapParser,
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    tls = require('tls'),
    net = require('net');


var ImapClient = exports.ImapClient = function(host, port, callback) {
  EventEmitter.call(this);

  //tls.connect(port, host, callback);

  var con = net.createConnection(port, host);
  con.setKeepAlive();

  var state = 0;

  con.on('data', function(d) {
    switch(state) {
      case 0:
        console.log(d.toString('utf8'));
        con.write('a001 STARTTLS\r\n');
        state = 1;
        break;
    case 1:
        var pair = new tls.createSecurePair();
        console.log(d.toString('utf8'));

        var clearcon = pipe(pair, con);
        
        pair.on('secure', function() {
          console.log('secure' + pair._ssl.verifyError());

          clearcon.write('a001 CAPABILITY\r\n');
//          clearcon.write('a002 LOGIN me@logansmyth.com pass\r\n'); // LOGIN
          clearcon.write('a003 EXAMINE INBOX\r\n');
        });
        

        clearcon.on('data', function(dat) {
          console.log('clear');
          console.log(dat.toString('utf8'));

        });
        state = 2;
        break;
      case 2:
        console.log('enc')
        console.log(d);
    }
  });


}
util.inherits(ImapClient, EventEmitter);





function pipe(pair, socket) {
  pair.encrypted.pipe(socket);
  socket.pipe(pair.encrypted);

  pair.fd = socket.fd;
  var cleartext = pair.cleartext;
  cleartext.socket = socket;
  cleartext.encrypted = pair.encrypted;
  cleartext.authorized = false;

  function onerror(e) {
    if (cleartext._controlReleased) {
      cleartext.emit('error', e);
    }
  }

  function onclose() {
    socket.removeListener('error', onerror);
    socket.removeListener('close', onclose);
  }

  socket.on('error', onerror);
  socket.on('close', onclose);

  return cleartext;
}
