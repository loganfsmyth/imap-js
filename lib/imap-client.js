
var ImapParser = require('./imap-parser').ImapParser,
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    tls = require('tls'),
    net = require('net');

var STATE_ERROR = 0x0;
var STATE_UNAUTH = 0x1;
var STATE_AUTH = 0x2;
var STATE_SELECT = 0x4;
var STATE_LOGOUT = 0x8;

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


function stateStr(st) {
  switch (st) {
    case STATE_ERROR:   state = "Error";        break;
    case STATE_UNAUTH:  state = "Unauthorized"; break;
    case STATE_AUTH:    state = "Authorized";   break;
    case STATE_SELECT:  state = "Selected";     break;
    case STATE_LOGOUT:  state = "Logout";       break;
  }
  return state;
}

function stateDecorator(state, func) {
  var states = [ STATE_ERROR, STATE_LOGOUT, STATE_UNAUTH, STATE_AUTH, STATE_SELECT ];
  return function() {
    var found = false;
    for (var i = 0, len = states.length; i < len; i++) {
      if (states[i] == state) {
        found = true;
      }
      if (found && states[i] == this.state) {
        func.apply(this, arguments);
        return;
      }
    }
    if (i == len) {
      arguments[arguments.length-1].call(this, new Error("This command is not available in the " + stateStr(state) + " state."));
    }
  }
}


var ImapClient = exports.ImapClient = function(host, port, secure, cb) {
  EventEmitter.call(this);
  var self = this;

  self.tag_counter = 1;
  self.responseCallbacks = {};
  self.continuationQueue = [];
  self.untagged = {};
  self.state = self.STATE_ERROR;

  var parser = new ImapParser(ImapParser.GREETING);
  parser.onContinuation = function(response) {
    self._processContinuation(response);
  }
  parser.onUntagged = function(response) {
    self._processUntagged(response);
  }
  parser.onTagged = function(response) {
    self._processTagged(response);
  }

  // For SSL we immediately define a secure connection
  if (secure == 'ssl') {
    self.con = tls.connect(port, host);
  }
  else {
    // otherwise we set up an insecure connection first
    self.con = net.createConnection(port, host);
    self.con.setKeepAlive(true);
  }

  self.con.on('connect', function() {
    self.emit('connect');
  });

  self.con.on('data', function(d) {
    console.log('Parsing: --------------\n' + d.toString('utf8') + '-----------');
//    try {
      parser.execute( d );
  /*  }
    catch(e) {
      console.log(e);
    }*/
  });

  parser.onGreeting = function(response) {
    if (response.type == 'BYE') {
      self.state = STATE_LOGOUT;
    }
    else if (response.type == 'PREAUTH') {
      self.state = STATE_AUTH;
    }
    else {
      self.state = STATE_UNAUTH;
    }

    // If we want tls, we trigger a starttls command
    if (secure == 'tls') {
      self.starttls(cb);
    }
    else {
      process.nextTick(cb);
    }

    self._processUntagged(response);
  }

}
util.inherits(ImapClient, EventEmitter);

ImapClient.prototype.STATE_ERROR    = STATE_ERROR;
ImapClient.prototype.STATE_UNAUTH   = STATE_UNAUTH;
ImapClient.prototype.STATE_AUTH     = STATE_AUTH;
ImapClient.prototype.STATE_SELECT   = STATE_SELECT;
ImapClient.prototype.STATE_LOGOUT   = STATE_LOGOUT;


ImapClient.prototype._processUntagged = function(response) {
  console.log(util.inspect(response, false, 6));
  switch (response.type) {
    case 'CAPABILITY':
      this.untagged['capability'] = (this.untagged['capability'] || [])
      this.untagged['capability'].push(response.value);
      break;
    case 'LIST':
      this.untagged['list'] = (this.untagged['list'] || {})
      this.untagged['list'][response.mailbox] = {'path': response.mailbox.split(response.delim), 'flags': response['list-flags']};
      break;
    case 'LSUB':
      this.untagged['lsub'] = ''; // TODO
      break;
    case 'STATUS':
    case 'EXPUNGE':
    case 'FETCH':
    case 'SEARCH':
      // TODO
      break;
    case 'FLAGS':
      this.untagged['flags'] = response.value;
      break;
    case 'EXISTS':
      this.untagged['exists'] = response.value;
      break;
    case 'RECENT':
      this.untagged['recent'] = response.value;
      break;
    case 'BYE':
      this.untagged['bye'] = response.text.text;
      break;
    case 'OK':
      switch (response.text.code) {
        case 'UNSEEN':
        case 'PERMANENTFLAGS':
        case 'UIDNEXT':
        case 'UIDVALIDITY':

      }
      break;
    default:
      console.log('untagged');
      console.log(response);
      break;
  }
}

ImapClient.prototype._processContinuation = function(response) {
//  console.log(response);
  var handler = this.continuationQueue.shift();
  var result = handler(response);
  if (result) {  // return false means it is not done
    this.con.write(result + '\r\n');
    this.continuationQueue.unshift(handler);
  }
}

ImapClient.prototype._processTagged = function(response) {
//  this._processUntagged(response);
//  console.log(response);
  if (this.responseCallbacks[response.tag]) {
    this.responseCallbacks[response.tag].call(this, (response.type != 'OK')?response.type:null, response.text);
    delete this.responseCallbacks[response.tag];
  }
  this.untagged = {};
}

ImapClient.prototype.enqueueCommand = function(command) {
  var tag = getCommandTag(this.tag_counter++);
  if (command.continuation) {
    this.continuationQueue.push(command.continuation);
  }
  this.responseCallbacks[tag] = command.response;
  this.con.write(tag + ' ' + command.command + "\r\n");
  console.log(command.command);
}

/**
 * Client Commands - Any State
 */
ImapClient.prototype.capability = function(cb) {
  this.enqueueCommand({
    command: 'CAPABILITY',
    response: function(err, response) {
      cb(err, response);
    },
  });
}

ImapClient.prototype.noop = function(cb) {
  this.enqueueCommand({
    command: 'NOOP',
    response: cb,
  });
}

ImapClient.prototype.logout = function(cb) {
  this.enqueueCommand({
    command: 'LOGOUT',
    response: function(err, resp) {
      if (!err) {
        this.state = STATE_LOGOUT;
      }
      cb(err, resp);
    },
  });
}

/**
 * Client Commands - Not Authenticated
 */
ImapClient.prototype.starttls = stateDecorator(STATE_UNAUTH, function(cb) {
  var self = this;
  this.enqueueCommand({
    command: 'STARTTLS',
    response: function(err, resp) {
      if (!err) {
        var pair = new tls.createSecurePair();
        var old_listeners = self.con.listeners('data');
        self.con.removeAllListeners('data');
        self.con = pipe(pair, self.con);
        old_listeners.forEach(function(func) {
          self.con.on('data', func);
        });
        
        pair.on('secure', function() {
          cb(err, resp);
        });
      }
      else {
        cb(err, resp);
      }
    },
  });
});

ImapClient.prototype.authenticate = stateDecorator(STATE_UNAUTH, function(auth_mechanism, cb) {
  this.enqueueCommand({
    command: 'AUTHENTICATE',
    continuation: function(text) {
      if (auth_mechanism.coninuation) auth_mechanism.continuation(text);
    },
    response: function(err, response) {
      if (auth_mechanism.response) auth_mechanism.response(err, response);
    },
  });
});

ImapClient.prototype.login = stateDecorator(STATE_UNAUTH, function(user, pass, cb) {
  var self = this;
  this.enqueueCommand({
    command: 'LOGIN ' + user + ' ' + pass,
    response: function(err, resp) {
      if (!err) {
        self.state = self.STATE_AUTH;
      }
      cb(err, resp);
    },
  });
});


/**
 * Client Commands - Authenticated
 */
ImapClient.prototype.select = stateDecorator(STATE_AUTH, function(mailbox, cb) {
  var self = this;
  this.enqueueCommand({
    command: 'SELECT ' + mailbox,
    response: function(err, response) {
      if (!err) {
        self.state = self.STATE_SELECT;
      }
      cb(err, response);
    },
  });
});

ImapClient.prototype.examine = stateDecorator(STATE_AUTH, function(mailbox, cb) {
  this.enqueueCommand({
    command: 'EXAMINE ' + mailbox,
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.create = stateDecorator(STATE_AUTH, function(mailbox, cb) {
  this.enqueueCommand({
    command: 'CREATE ' + mailbox,
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.delete = stateDecorator(STATE_AUTH, function(mailbox, cb) {
  this.enqueueCommand({
    command: 'DELETE ' + mailbox,
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.rename = stateDecorator(STATE_AUTH, function(current_mailbox, new_mailbox, cb) {
  this.enqueueCommand({
    command: 'RENAME ' + current_mailbox + ' ' + new_mailbox,
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.subscribe = stateDecorator(STATE_AUTH, function(mailbox, cb) {
  this.enqueueCommand({
    command: 'SUBSCRIBE ' + mailbox,
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.unsubscribe = stateDecorator(STATE_AUTH, function(mailbox, cb) {
  this.enqueueCommand({
    command: 'UNSUBSCRIBE ' + mailbox,
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.list = stateDecorator(STATE_AUTH, function(ref_name, mailbox /* w/ wildcards */, cb) {
  //TODO: Preprocessing args?
  this.enqueueCommand({
    command: 'LIST ' + ref_name + ' ' + mailbox,
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.lsub = stateDecorator(STATE_AUTH, function(ref_name, mailbox /* w/ wildcards */, cb) {
  //TODO: preprocess
  this.enqueueCommand({
    command: 'LSUB ' + ref_name + ' ' + mailbox,
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.status = stateDecorator(STATE_AUTH, function(mailbox, item_names, cb) {
  //TODO items 
  this.enqueueCommand({
    command: 'STATUS ' + mailbox + ' (' + item_names.join(' ') + ')',
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.append = stateDecorator(STATE_AUTH, function(mailbox, flag_list, datetime, message, cb) {
  //TODO: process flags
  this.enqueueCommand({
    command: 'APPEND ' + mailbox + ' (' + flag_list.join(' ') + ') ' + datetime + '{' + (new Buffer(message, 'utf8')).length + '}',
    continuation: function(text) {
      console.log(text);
      return message;
    },
    response: function(err, response) {
      cb(err, response);
    },
  });
});

/**
 * Client Commands - Selected
 */
ImapClient.prototype.check = stateDecorator(STATE_SELECT, function(cb) {
  this.enqueueCommand({
    command: 'CHECK',
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.close = stateDecorator(STATE_SELECT, function(cb) {
  this.enqueueCommand({
    command: 'CLOSE',
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.expunge = stateDecorator(STATE_SELECT, function(cb) {
  this.enqueueCommand({
    command: 'EXPUNGE',
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.search = stateDecorator(STATE_SELECT, function(charset, criteria, cb) {
  this.enqueueCommand({
    command: 'SEARCH ' + charset + ' ' + criteria, //TODO process args
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.fetch = stateDecorator(STATE_SELECT, function(seq_set, item_names, cb) {
  this.enqueueCommand({
    command: 'FETCH ' + seq_set + ' ' + item_names,
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.store = stateDecorator(STATE_SELECT, function(seq_set, item_name, value, cb) {
  this.enqueueCommand({
    command: 'STORE ' + seq_set + ' ' + item_name + ' ' + value,
    response: function(err, response) {
      cb(err, response);
    },
  });
});

ImapClient.prototype.copy = stateDecorator(STATE_SELECT, function(seq_set, mailbox, cb) {
  this.enqueueCommand({
    command: 'COPY ' + seq_set + ' ' + mailbox,
    response: function(err, response) {
      cb(err, response);
    },
  });
});


// TODO
ImapClient.prototype.uid = stateDecorator(STATE_SELECT, function(command, args, cb) {
  this.enqueueCommand({
    command: 'UID ' + command + args.join(' '),
    response: function(err, response) {
      cb(err, response);
    },
  });
});








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
