
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

function defineCommand(state, command_cb, response_cb, continue_cb) {
  var states = [ STATE_ERROR, STATE_LOGOUT, STATE_UNAUTH, STATE_AUTH, STATE_SELECT ];

  return function() {
    var self = this;

    // Split the callback from the command args
    var cb = arguments[arguments.length-1];
    var args = Array.prototype.slice.call(arguments, 0, arguments.length-1);
    var found = false;

    // Loop through states to make sure that the current state is at or above the allowed states
    for (var i = 0, len = states.length; i < len; i++) {
      if (states[i] == state) {
        found = true;
      }
      if (found && states[i] == self.state) {

        // Build a command opject
        var command = {
          // Allow string or function as command
          command: (typeof command_cb == 'function')?command_cb.apply(self, args):command_cb,

          // If there is a special callback, pass it the args and callback otherwise just trigger the callback
          response: function() {
            if (response_cb) {
              var args = Array.prototype.slice.call(arguments, 0, arguments.length);
              args.push(cb);
              return response_cb.apply(self, args);
            }
            else {
              return cb.apply(null, arguments);
            }
          },
        };

        // If the command has a continuation handler, add the function
        // and pass it the same arguments as the command itself
        if (continue_cb) {
          command.continuation = function(response, cb) {
            var ar = [ response, cb ].concat(args);
            return continue_cb.apply(self, ar);
          }
        }

        self.enqueueCommand(command);
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

  // Initialize the parser to wait for a greeting
  // It will automatically expect a normal response after that
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
    parser.execute( d );
  });

  // Add greeting handler to set the initial state of the connection
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
    
    self._processUntagged(response);

    // If we want tls, we trigger a starttls command
    if (secure == 'tls') {
      self.starttls(cb);
    }
    else {
      process.nextTick(cb);
    }
  }

}
util.inherits(ImapClient, EventEmitter);

ImapClient.prototype.STATE_ERROR    = STATE_ERROR;
ImapClient.prototype.STATE_UNAUTH   = STATE_UNAUTH;
ImapClient.prototype.STATE_AUTH     = STATE_AUTH;
ImapClient.prototype.STATE_SELECT   = STATE_SELECT;
ImapClient.prototype.STATE_LOGOUT   = STATE_LOGOUT;


ImapClient.prototype._processUntagged = function(response) {
//  console.log(util.inspect(response, false, 6));
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
//      console.log('untagged');
//      console.log(response);
      break;
  }
}

ImapClient.prototype._processContinuation = function(response) {
  var handler = this.continuationQueue.shift();
  var self = this;
  handler(response, function(result) {
    if (result) {  // return false means it is not done
      self.con.write(result + '\r\n');
      self.continuationQueue.unshift(handler);
    }
  });
}

ImapClient.prototype._processTagged = function(response) {
//  this._processUntagged(response);
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
ImapClient.prototype.capability = defineCommand(
  STATE_UNAUTH,
  'CAPABILITY'
);

ImapClient.prototype.noop = defineCommand(
  STATE_UNAUTH,
  'NOOP'
);

ImapClient.prototype.logout = defineCommand(
  STATE_UNAUTH,
  'LOGOUT',
  function(err, resp, cb) {
    if (!err) {
      this.state = STATE_LOGOUT;
    }
    cb(err, resp);
  }
);

/**
 * Client Commands - Not Authenticated
 */
ImapClient.prototype.starttls = defineCommand(
  STATE_UNAUTH,
  'STARTTLS',
  function(err, resp, cb) {
    if (!err) {
      var self = this;
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
  }
);

ImapClient.prototype.authenticate = defineCommand(
  STATE_UNAUTH,
  function(auth_mechanism) {
    return 'AUTHENTICATE';
  },
  function(err, response, cb) {
    if (auth_mechanism.response) auth_mechanism.response(err, response, cb);
    else cb();
  },
  function(text, cb) {
     if (auth_mechanism.continuation) auth_mechanism.continuation(err, response, cb);
    else cb();
  }
);

ImapClient.prototype.login = defineCommand(
  STATE_UNAUTH, 
  function(user, pass) {
    return 'LOGIN ' + user + ' ' + pass;
  },
  function(err, resp, cb) {
    if (!err) {
      this.state = this.STATE_AUTH;
    }
    cb(err, resp);
  }
);


/**
 * Client Commands - Authenticated
 */
ImapClient.prototype.select = defineCommand(
  STATE_AUTH,
  function(mailbox) {
    return 'SELECT ' + mailbox;
  },
  function(err, response, cb) {
    if (!err) {
      this.state = this.STATE_SELECT;
    }
    cb(err, response);
  }
);

ImapClient.prototype.examine = defineCommand(
  STATE_AUTH,
  function(mailbox) {
    return 'EXAMINE ' + mailbox;
  }
);

ImapClient.prototype.create = defineCommand(
  STATE_AUTH,
  function(mailbox) {
    return 'CREATE ' + mailbox;
  }
);

ImapClient.prototype.delete = defineCommand(
  STATE_AUTH,
  function(mailbox) {
    return 'DELETE ' + mailbox;
  }
);

ImapClient.prototype.rename = defineCommand(
  STATE_AUTH,
  function(current_mailbox, new_mailbox) {
    return 'RENAME ' + current_mailbox + ' ' + new_mailbox;
  }
);

ImapClient.prototype.subscribe = defineCommand(
  STATE_AUTH,
  function(mailbox) {
    return 'SUBSCRIBE ' + mailbox;
  }
);

ImapClient.prototype.unsubscribe = defineCommand(
  STATE_AUTH,
  function(mailbox) {
    return 'UNSUBSCRIBE ' + mailbox;
  }
);

ImapClient.prototype.list = defineCommand(
  STATE_AUTH,
  function(ref_name, mailbox /* w/ wildcards */) {
    return 'LIST ' + ref_name + ' ' + mailbox;
  }
);

ImapClient.prototype.lsub = defineCommand(
  STATE_AUTH,
  function(ref_name, mailbox /* w/ wildcards */) {
    //TODO: preprocess
    return 'LSUB ' + ref_name + ' ' + mailbox;
  }
);

ImapClient.prototype.status = defineCommand(
  STATE_AUTH,
  function(mailbox, item_names) {
    //TODO items 
    return 'STATUS ' + mailbox + ' (' + item_names.join(' ') + ')';
  }
);

ImapClient.prototype.append = defineCommand(
  STATE_AUTH,
  function(mailbox, flag_list, datetime, message) {
    //TODO: process flags
    return 'APPEND ' + mailbox + ' (' + flag_list.join(' ') + ') ' + datetime + '{' + (new Buffer(message, 'utf8')).length + '}';
  },
  null,
  function(text, cb, mailbox, flag_list, datetime, message) {
    console.log(arguments);
    cb(message);
  }
);


/**
 * Client Commands - Selected
 */
ImapClient.prototype.check = defineCommand(STATE_SELECT, 'CHECK');

ImapClient.prototype.close = defineCommand(STATE_SELECT, 'CLOSE');

ImapClient.prototype.expunge = defineCommand(STATE_SELECT, 'EXPUNGE');

ImapClient.prototype.search = defineCommand(
  STATE_SELECT,
  function(charset, criteria) {
    //TODO process args
    return 'SEARCH ' + charset + ' ' + criteria;
  }
);

ImapClient.prototype.fetch = defineCommand(
  STATE_SELECT,
  function(seq_set, item_names) {
    return 'FETCH ' + seq_set + ' ' + item_names;
  }
);

ImapClient.prototype.store = defineCommand(
  STATE_SELECT,
  function(seq_set, item_name, value) {
    return 'STORE ' + seq_set + ' ' + item_name + ' ' + value;
  }
);

ImapClient.prototype.copy = defineCommand(
  STATE_SELECT,
  function(seq_set, mailbox) {
    return 'COPY ' + seq_set + ' ' + mailbox;
  }
);


// TODO
ImapClient.prototype.uid = defineCommand(
  STATE_SELECT,
  function(command, args, cb) {
    return 'UID ' + command + args.join(' ');
  }
);


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
