
var testCase = require('nodeunit').testCase;
var ImapParser = require('./imap_parser').ImapParser;
var p = new ImapParser();


function runner(str) {
  var b = new Buffer(str);

  return function() {
    return p.execute(b, 0, b.length-1);
  }
}


module.exports = testCase({
  setUp: function(callback) {
    p.reinitialize();
    callback();
  },

  respCondState: {
    bad : function(test) {
      test.doesNotThrow(runner('a001 BAD Failure'));
      test.done();
    },
    ok : function(test) {
      test.doesNotThrow(runner('a001 OK Failure'));
      test.done();
    },
    no : function(test) {
      test.doesNotThrow(runner('a001 NO Failure'));
      test.done();
    },
    bye : function(test) {
      test.throws(runner('a001 BYE Failure'));
      test.done();
    },
    b : function(test) {
      test.throws(runner('a001 B Failure'));
      test.done();
    },
    random : function(test) {
      test.throws(runner('a001 hfbgfd Failure'));
      test.done();
    },
  },


});
