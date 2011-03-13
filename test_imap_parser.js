
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

  response_data: {
    resp_cond_state: {
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
    resp_cond_bye: {
      correct: function(test) {
        test.doesNotThrow(function() {
          runner('* BYE misc test\r\n')();
        });
        test.done();
      },
      wrong: function(test) {
        test.throws(runner('* BYE\r\n'));
        test.done();
      },
    }
  },

  /*
  continue_req: {
    resp_text: {
      no_code: function(test) {
        test.doesNotThrow(runner("+ some random text hagahaha\r\n"));
        test.done();
      },
      code_alert: function(test) {
        test.doesNotThrow(runner("+ [ALERT] some random text hagahaha\r\n"));
        test.done();
      },
      code_badcharset: function(test) {
        test.doesNotThrow(runner("+ [BADCHARSET (jhdsfdgsfg)] some random text hagahaha\r\n"));
        test.done();
      },
      code_badcharset_dquoted: function(test) {
        test.doesNotThrow(runner("+ [BADCHARSET (\"jhdsfdgsfg\")] some random text hagahaha\r\n"));
        test.done();
      },
      code_badcharset_literal: function(test) {
        test.doesNotThrow(runner("+ [BADCHARSET ({2}\r\nAB)] some random text hagahaha\r\n"));
        test.done();
      },
      code_badcharset_literal_two: function(test) {
        test.doesNotThrow(runner("+ [BADCHARSET ({2}\r\nAB{3}\r\n123)] some random text hagahaha\r\n"));
        test.done();
      },
      code_parse: function(test) {
        test.doesNotThrow(runner("+ [PARSE] some random text hagahaha\r\n"));
        test.done();
      },
      code_permflags: function(test) {
        test.doesNotThrow(runner("+ [PERMANENTFLAGS ()] some random text hagahaha\r\n"));
        test.done();
      },
      code_permflags_multi: function(test) {
        test.doesNotThrow(runner("+ [PERMANENTFLAGS (\\Answered \\Deleted)] some random text hagahaha\r\n"));
        test.done();
      },
      code_readonly: function(test) {
        test.doesNotThrow(runner("+ [READ-ONLY] some random text hagahaha\r\n"));
        test.done();
      },
      code_readwrite: function(test) {
        test.doesNotThrow(runner("+ [READ-WRITE] some random text hagahaha\r\n"));
        test.done();
      },
      code_trycreate: function(test) {
        test.doesNotThrow(runner("+ [TRYCREATE] some random text hagahaha\r\n"));
        test.done();
      },
      code_uidnext: function(test) {
        test.doesNotThrow(runner("+ [UIDNEXT 345] some random text hagahaha\r\n"));
        test.done();
      },
      code_uidvalidity: function(test) {
        test.doesNotThrow(runner("+ [UIDVALIDITY 654] some random text hagahaha\r\n"));
        test.done();
      },
      code_unseen: function(test) {
        test.doesNotThrow(runner("+ [UNSEEN 654] some random text hagahaha\r\n"));
        test.done();
      },
      code_atom: function(test) {
        test.doesNotThrow(runner("+ [G FGH] some random text hagahaha\r\n"));
        test.done();
      },
      code_atom_noarg: function(test) {
        test.doesNotThrow(runner("+ [J] some random text hagahaha\r\n"));
        test.done();
      },
    },
    base64: {
      two_b64: function(test) {
        test.doesNotThrow(runner("+ ++==\r\n"));
        test.doesNotThrow(runner("+ 94==\r\n"));
        test.doesNotThrow(runner("+ A9==\r\n"));
        test.doesNotThrow(runner("+ /H==\r\n"));
        test.done();
      },
      three_b64: function(test) {
        test.doesNotThrow(runner("+ +L+=\r\n"));
        test.doesNotThrow(runner("+ 9A4=\r\n"));
        test.doesNotThrow(runner("+ AV9=\r\n"));
        test.doesNotThrow(runner("+ /QH=\r\n"));
        test.done();
      }
    }
  },
  */
});
