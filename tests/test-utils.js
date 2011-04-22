
var testCase = require('nodeunit').testCase;
var ImapParser = require('../lib/imap-parser').ImapParser;
var p = new ImapParser(ImapParser.RESPONSE);
var mod = {};
var type = ImapParser.RESPONSE;

var tests = {};

var runner = function(args) {
  var done = false;
  p.onGreeting = p.onUntagged = p.onTagged = p.onContinuation = function() {
    done = true;
  }
  return function() {
    for(var i = 0, len = args.length; i < len; i++) {
      var b = new Buffer(args[i]);
      p.execute( b );
    }
    if (!done) {
      throw new Error("Command Incomplete");
    }
  }
}


mod.type = function(t) {
  switch(t) {
    case 'g':
      type = ImapParser.GREETING;
      break;
    case 'r':
      type = ImapParser.RESPONSE;
      break;
    case 'c':
      type = ImapParser.COMMAND;
      break;
  }
}

mod.parse_success = function() {
  var args = Array.prototype.slice.call(arguments, 1);
  tests[arguments[0]] = function(test) {
    test.doesNotThrow(runner(args));
    test.done();
  }
}

mod.parse_failure = function() {
  var args = Array.prototype.slice.call(arguments, 1);
  tests[arguments[0]] = function(test) {
    test.throws(runner(args));
    test.done();
  }
}


mod.tests = function() {
  tests.setUp = function(cb) {
    p.reinitialize(type);
    console.log('----------------------');
    cb();
  };

  var cases = testCase(tests);
  tests = {};
  return cases;
}

module.exports = mod;
