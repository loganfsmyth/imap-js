b = (s) -> new Buffer s

tests = 
  "0 NOOP\n":
    tag: '0'
    command: 'NOOP'
  "{ NOOP\n": null
  "0 CAPABILITY\n":
    tag: '0'
    command: 'CAPABILITY'
  "0 LOGOUT\n":
    tag: '0'
    command: 'LOGOUT'
  "0 APPEND mybox (\\flag) \"10-Jan-2010 12:11:10 +0500\" {4}\n":
    tag: '0'
    command: 'APPEND'
    flags: [ b '\\flag' ]
    date: new Date "10-Jan-2010 12:11:10 +0500"
    size: 4
  "0 CREATE mailbox\n":
    tag: '0'
    command: 'CREATE'
    box: 'mailbox'
  "0 DELETE mailbox\n":
    tag: '0'
    command: 'DELETE'
    box: 'mailbox'
  "0 EXAMINE mailbox\n":
    tag: '0'
    command: 'EXAMINE'
    box: 'mailbox'
  "0 LIST mailbox listbox\n":
    tag: '0'
    command: 'LIST'
    box: 'mailbox'
    listbox: 'listbox'
  "0 LSUB mailbox listbox\n":
    tag: '0'
    command: 'LSUB'
    box: 'mailbox'
    listbox: 'listbox'
  "0 RENAME mailbox newmailbox\n":
    tag: '0'
    command: 'CREATE'
    box: 'mailbox'
    newbox: 'newmailbox'
  "0 SELECT mailbox\n":
    tag: '0'
    command: 'SELECT'
    box: 'mailbox'
  "0 STATUS mailbox (MESSAGES RECENT)\n":
    tag: '0'
    command: 'STATUS'
    box: 'mailbox'
    attrs: ['MESSAGES', 'RECENT']
  "0 SUBSCRIBE mailbox\n":
    tag: '0'
    command: 'SUBSCRIBE'
    box: 'mailbox'
  "0 UNSUBSCRIBE mailbox\n":
    tag: '0'
    command: 'UNSUBSCRIBE'
    box: 'mailbox'
  "0 LOGIN \"username\" \"password\"\n":
    tag: '0'
    command: 'LOGIN'
    user: 'username'
    pass: 'password'
  "0 AUTHENTICATE GSSAPI\n":
    tag: '0'
    command: 'AUTHENTICATE'
    type: 'GSSAPI'
  "0 STARTTLS\n":
    tag: '0'
    command: 'STARTTLS'
  "0 CHECK\n":
    tag: '0'
    command: 'CHECK'
  "0 CLOSE\n":
    tag: '0'
    command: 'CLOSE'
  "0 EXPUNGE\n":
    tag: '0'
    command: 'EXPUNGE'
  "0 COPY 1:2 INBOX\n":
    tag: '0'
    command: 'COPY'
    seq: [[1,2]]
    box: 'INBOX'
  "0 FETCH 1:2 (ENVELOPE FLAGS INTERNALDATE BODY[HEADER]<4.5>)\n":
    tag: '0'
    command: 'FETCH'
    seq: [[1,2]]
    attrs: ['ENVELOPE', 'FLAGS', 'INTERNALDATE', ['BODY', 'HEADER', [4,5]]]
  "0 STORE 1:4 FLAGS.SILENT (\\flag)\n":
    tag: '0'
    command: 'STORE'
    seq: [[1,4]]
    op: 'FLAGS'
    silent: true
    flags: ['\\flag']
  "0 SEARCH CHARSET UTF8 (1:10 ALL ANSWERED BCC hi BEFORE \"10-Jan-2010\" (DRAFT UID 1:18))\n":
    tag: '0'
    command: 'SEARCH'
    charset: 'UTF8'
    keys: [
      [1,10]
      'ALL'
      'ANSWERED'
      ['BCC', 'hi']
      ['BEFORE', '10-Jan-2010']
      ['DRAFT', ['UID', [1,18]]]
    ]

module.exports = require('./helper').genTests('command', tests)

