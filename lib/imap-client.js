
var ImapParser = require('./imap_parser_native').ImapParser,
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    tls = require('tls'),
    net = require('net');


var tagChars = new Array(0x7E);
for (var i = 0x01; i <= 0x7F; i++) {
  tagChars[i-1] = String.fromCharCode(i);
}
tagChars = tagChars.filter(function(c) {
  return !(c == '(' || c == ')' || c == '{' || c == ' ' || c == '\\' || c == '"' || c == '%' || c == '*' || c == '+')
          && ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')); // For readability
});

var len = tagChars.length;

function getCommandTag (count) {
  var tag = '';
  while(count >= 1) {
    var l = Math.floor(count%len);
    tag = tagChars[l] + tag;
    count /= len;
  }
  return tag;
};



var ImapClient = exports.ImapClient = function(host, port, secure, cb) {
  EventEmitter.call(this);

  var self = this;
  var untagged = [];
  var tag_counter = 1;

  var responseCallbacks = {};
  var continuationQueue = [];

  if (secure == 'ssl') {
    self.con = tls.connect(port, host);
  }
  else {
    self.con = net.createConnection(port, host);
    self.con.setKeepAlive(true);
  }

  var parser = new ImapParser();

  parser.onContinuation = function(text) {
    var handler = self.continuationQueue.shift();
    var result = handler(text);
    if (result) {
      // return false means it is not done
      self.con.write(result);
      self.continuationQueue.unshift(handler);
    }
  };
  parser.onUntagged = function(text) {
    untagged.push(text);
  };
  parser.onTagged = function(tag, type, text) {
    if (responseCallbacks[tag]) {
      responseCallbacks[tag](type, text, untagged);
      untagged = [];
      delete responseCallbacks[tag];
    }
  };


  self.con.on('connect', function onconnect() {
    self.emit('connect');
  });

  self.con.on('data', function(d) {
    console.log('Totally parsing: ' + d.toString('utf8'));
    try {
      parser.execute(d, 0, d.length);
    }
    catch(e) {
      console.log(e);
    }
  });


  self.enqueueCommand = function(command) {
    var tag = getCommandTag(tag_counter++);

    if (command.continuation) {
      continuationQueue.push(command.continuation);
    }

    responseCallbacks[tag] = command.response;
    var com = tag + ' ' + command.command + "\r\n";
    console.log(com);
    self.con.write(tag + ' ' + command.command + "\r\n");

  }

  if (secure == 'tls') {
    this.starttls(function(type, text, response) {
      cb(type);
    });
  }
  else {
    process.nextTick(cb);
  }

}
util.inherits(ImapClient, EventEmitter);


/**
 * Client Commands - Any State
 */
ImapClient.prototype.capability = function(cb) {
  this.enqueueCommand({
    command: 'CAPABILITY',
    result: function(type, text, response) {
      cb(type, text, response);
    },
  });
}

ImapClient.prototype.noop = function(cb) {
  this.enqueueCommand({
    command: 'NOOP',
    result: cb,
  });
}

ImapClient.prototype.logout = function(cb) {
  this.enqueueCommand({
    command: 'LOGOUT',
    result: cb,
  });
}

/**
 * Client Commands - Not Authenticated
 */
ImapClient.prototype.starttls = function(cb) {
  var self = this;
  this.enqueueCommand({
    command: 'STARTTLS',
    response: function(type, text, response) {
      if (type == 'OK') {
        var pair = new tls.createSecurePair();
        var old_listeners = self.con.listeners('data');
        self.con.removeAllListeners('data');
        self.con = pipe(pair, self.con);
        old_listeners.forEach(function(func) {
          self.con.on('data', func);
        });
        
        pair.on('secure', function() {
          cb(type, text, response);
        });
      }
      else {
          cb(type, text, response);
      }
    },
  });
}

ImapClient.prototype.authenticate = function(auth_mechanism, cb) {
  this.enqueueCommand({
    command: 'AUTHENTICATE',
    continuation: function(text) {
      if (auth_mechanism.coninuation) auth_mechanism.continuation(text);
    },
    response: function(type, text, response) {
      if (auth_mechanism.response) auth_mechanism.response(type, text, response);
    },
  });
}

ImapClient.prototype.login = function(user, pass, cb) {
  this.enqueueCommand({
    command: 'LOGIN ' + user + ' ' + pass,
    response: cb
  });
}


/**
 * Client Commands - Authenticated
 */

ImapClient.prototype.select = function(mailbox, cb) {
  this.enqueueCommand({
    command: 'SELECT ' + mailbox,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.examine = function(mailbox, cb) {
  this.enqueueCommand({
    command: 'EXAMINE ' + mailbox,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.create = function(mailbox, cb) {
  this.enqueueCommand({
    command: 'CREATE ' + mailbox,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.delete = function(mailbox, cb) {
  this.enqueueCommand({
    command: 'DELETE ' + mailbox,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.rename = function(current_mailbox, new_mailbox, cb) {
  this.enqueueCommand({
    command: 'RENAME ' + current_mailbox + ' ' + new_mailbox,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.subscribe = function(mailbox, cb) {
  this.enqueueCommand({
    command: 'SUBSCRIBE ' + mailbox,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.unsubscribe = function(mailbox, cb) {
  this.enqueueCommand({
    command: 'UNSUBSCRIBE ' + mailbox,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.list = function(ref_name, mailbox /* w/ wildcards */, cb) {
  //TODO: Preprocessing args?
  this.enqueueCommand({
    command: 'LIST ' + mailbox,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.lsub = function(ref_name, mailbox /* w/ wildcards */, cb) {
  //TODO: preprocess
  this.enqueueCommand({
    command: 'LSUB ' + mailbox,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.status = function(mailbox, item_names, cb) {
  //TODO items 
  this.enqueueCommand({
    command: 'STATUS ' + mailbox,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.append = function(mailbox, flag_list, datetime, message, cb) {
  //TODO: process flags
  this.enqueueCommand({
    command: 'APPEND ' + mailbox,
    continuation: function(text) {


    },
    response: function(type, text, response) {

    },
  });


}

/**
 * Client Commands - Selected
 */
ImapClient.prototype.check = function(cb) {
    this.enqueueCommand({
    command: 'CHECK',
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.close = function(cb) {
    this.enqueueCommand({
    command: 'CLOSE',
    response: function(type, text, response) {

    },
  });


}

ImapClient.prototype.expunge = function(cb) {
    this.enqueueCommand({
    command: 'EXPUNGE ' + mailbox,
    response: function(type, text, response) {

    },
  });


}

ImapClient.prototype.search = function(charset, criteria, cb) {
  this.enqueueCommand({
    command: 'SEARCH ' + charset + ' ' + criteria, //TODO process args
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.fetch = function(seq_set, item_names, cb) {
  this.enqueueCommand({
    command: 'FETCH ' + seq_set,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.store = function(seq_set, item_name, value, cb) {
  this.enqueueCommand({
    command: 'STORE ' + seq_set,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.copy = function(seq_set, mailbox, cb) {
  this.enqueueCommand({
    command: 'COPY ' + seq_set,
    response: function(type, text, response) {

    },
  });
}

ImapClient.prototype.uid = function(command, args, cb) {
  this.enqueueCommand({
    command: 'UID ' + command + args.join(' '),
    response: function(type, text, response) {

    },
  });
}








//  Copied directly from node's lib/tls.js
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
