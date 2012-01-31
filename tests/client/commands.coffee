
{testCase} = require 'nodeunit'
Stream = require 'stream'
client = require '../../index'

cl = null
s = null

class TestStream extends Stream
  constructor: ({write, resp}, @test)->
    process.nextTick =>
      @emit 'connect'
      @emit 'data', "* OK Greetings!\r\n"

    @write = (buf, enc) ->
      buf = new Buffer buf, enc if enc
      @test.equal buf.toString('utf8'), write, 'Sent command matches expected value'

      process.nextTick =>
        @emit 'data', resp

cmd = (args) ->
  (test) ->
    s = new TestStream args, test
    cl = client.createClient stream: s, ->
      args.command test

module.exports = testCase
  capability: cmd
    write: "0 CAPABILITY\r\n"
    resp: "* OK IMAP4rev1 LITERAL+\r\n0 OK CAPABILITY done.\r\n"
    command: (test) ->
      cl.capability (err, caps) ->
        test.ok not err, "No command errors"
        test.deepEqual caps, ['IMAP4rev1', 'LITERAL+']
        test.done()
  noop: cmd
    write: "0 NOOP\r\n"
    resp: "0 OK NOOP Completed\r\n"
    command: (test) ->
      cl.noop (err) ->
        test.ok not err, "No command errors"
        test.done()
  logout: cmd
    write: "0 LOGOUT\r\n"
    resp: "0 OK LOGOUT done.\r\n"
    command: (test) ->
      cl.capability (err) ->
        test.ok not err, "No command errors"
        test.done()
  # starttls: cmd
  # authenticate: cmd
  login: cmd
    write: "0 LOGIN \"user\" \"pass\"\r\n"
    resp: "0 OK LOGIN completed\r\n"
    command: (test) ->
      cl.login 'user', 'pass', (err) ->
        test.ok not err, "No command errors"
        test.done()

  select: cmd
    write: "0 SELECT \"INBOX\"\r\n"
    resp: "* FLAGS (\\Flag \\Flag2)\r\n" + "* 5 EXISTS\r\n" + "* 3 RECENT\r\n" +
          "* OK [UNSEEN 14] Unseen\r\n" + "* OK [PERMANENTFLAGS (\\* \\Deleted)] Perm\r\n" +
          "* OK [UIDNEXT 43] Next\r\n" + "* OK [UIDVALIDITY 7654] Valid\r\n" +
          "0 OK Select Complete\r\n"
    command: (test) ->
      cl.select 'INBOX', (err, {flags, exists, recent, unseen, permflags, uidnext, uidvalidity}) ->
        test.ok not err, "No command errors"
        test.deepEqual flags, ['\\Flag', '\\Flag2']
        test.equal exists, 5
        test.equal recent, 3
        test.equal unseen, 14
        test.deepEqual permflags, ['\\*', '\\Deleted']
        test.equal uidnext, 43
        test.equal uidvalidity, 7654
        test.done()

  examine: cmd
    write: "0 EXAMINE \"INBOX\"\r\n"
    resp: "* FLAGS (\\Flag \\Flag2)\r\n" + "* 5 EXISTS\r\n" + "* 3 RECENT\r\n" +
          "* OK [UNSEEN 14] Unseen\r\n" + "* OK [PERMANENTFLAGS (\\* \\Deleted)] Perm\r\n" +
          "* OK [UIDNEXT 43] Next\r\n" + "* OK [UIDVALIDITY 7654] Valid\r\n" +
          "0 OK Examine Complete\r\n"
    command: (test) ->
      cl.examine 'INBOX', (err, {flags, exists, recent, unseen, permflags, uidnext, uidvalidity}) ->
        test.ok not err, "No command errors"
        test.deepEqual flags, ['\\Flag', '\\Flag2']
        test.equal exists, 5
        test.equal recent, 3
        test.equal unseen, 14
        test.deepEqual permflags, ['\\*', '\\Deleted']
        test.equal uidnext, 43
        test.equal uidvalidity, 7654
        test.done()

  create: cmd
    write: "0 CREATE \"INBOX\"\r\n"
    resp: "0 OK Create done.\r\n"
    command: (test) ->
      cl.create 'INBOX', (err) ->
        test.ok not err, "No command errors"
        test.done()

  delete: cmd
    write: "0 DELETE \"INBOX\"\r\n"
    resp: "0 OK done.\r\n"
    command: (test) ->
      cl.delete 'INBOX', (err) ->
        test.ok not err, "No command errors"
        test.done()

  rename: cmd
    write: "0 RENAME \"INBOX2\" \"INBOX3\"\r\n"
    resp: "0 OK done.\r\n"
    command: (test) ->
      cl.rename 'INBOX2', 'INBOX3', (err) ->
        test.ok not err, "No command errors"
        test.done()

  subscribe: cmd
    write: "0 SUBSCRIBE \"INBOX\"\r\n"
    resp: "0 OK done.\r\n"
    command: (test) ->
      cl.subscribe 'INBOX', (err) ->
        test.ok not err, "No command errors"
        test.done()

  unsubscribe: cmd
    write: "0 UNSUBSCRIBE \"INBOX\"\r\n"
    resp: "0 OK done.\r\n"
    command: (test) ->
      cl.unsubscribe 'INBOX', (err) ->
        test.ok not err, "No command errors"
        test.done()

  list: cmd
    write: "0 LIST \"\" \"INBOX\""
    resp: "* LIST (\\Noinferiors) \"/\" \"INBOX\"\r\n" +
          "* LIST (\\Noinferiors \\Unmarked) \"/\" \"INBOX/subdir\"\r\n"
          "* LIST (\\Noinferiors \\Unmarked) \"/\" \"INBOX/subdir2\"\r\n"
          "* LIST (\\Noinferiors \\Unmarked) \"/\" \"INBOX2\"\r\n" + "0 OK done.\r\n"
    command: (test) ->
      cl.list '', 'INBOX', (err, boxes, sep) ->
        test.ok not err, "No command errors"
        test.deepEqual boxes, [
          'INBOX' : ['\\Noinferiors']
          'INBOX/subdir' : ['\\Noinferiors', '\\Unmarked']
          'INBOX/subdir2' : ['\\Noinferiors', '\\Unmarked']
          'INBOX2' : ['\\Noinferiors', '\\Unmarked']
        ]
        test.equal sep, '/'
        test.done()

  lsub: cmd
    write: "0 LSUB \"\" \"INBOX\""
    resp: "* LSUB (\\Noinferiors) \"/\" \"INBOX\"\r\n" +
          "* LSUB (\\Noinferiors \\Unmarked) \"/\" \"INBOX/subdir\"\r\n"
          "* LSUB (\\Noinferiors \\Unmarked) \"/\" \"INBOX/subdir2\"\r\n"
          "* LSUB (\\Noinferiors \\Unmarked) \"/\" \"INBOX2\"\r\n" + "0 OK done.\r\n"
    command: (test) ->
      cl.list '', 'INBOX', (err, boxes, sep) ->
        test.ok not err, "No command errors"
        test.deepEqual boxes, [
          'INBOX' : ['\\Noinferiors']
          'INBOX/subdir' : ['\\Noinferiors', '\\Unmarked']
          'INBOX/subdir2' : ['\\Noinferiors', '\\Unmarked']
          'INBOX2' : ['\\Noinferiors', '\\Unmarked']
        ]
        test.equal sep, '/'
        test.done()



  status: cmd
    write: "0 STATUS \"INBOX\" (UIDNEXT MESSAGES)"
    resp: "* STATUS \"INBOX\" (MESSAGES 23 UIDNEXT 543)\r\n" + "0 OK done.\r\n"
    command: (test) ->
      cl.status 'INBOX', ['UIDNEXT', 'MESSAGES'], (err, stat) ->
        test.ok not err, "No command errors"
        test.deepEqual stat,
          uidnext: 543
          messages: 23
        test.done()

  # append:

  check: cmd
    write: "0 CHECK\r\n"
    resp: "0 OK Done.\r\n"
    command: (test) ->
      cl.check (err) ->
        test.ok not err, "No command errors"
        test.done()

  close: cmd
    write: "0 CLOSE\r\n"
    resp: "0 OK Done.\r\n"
    command: (test) ->
      cl.close (err) ->
        test.ok not err, "No command errors"
        test.done()

  expunge: cmd
    write: "0 EXPUNGE\r\n"
    resp: "* 3 EXPUNGE\r\n" + "* 3 EXPUNGE\r\n" + "* 5 EXPUNGE\r\n" + "* 8 EXPUNGE\r\n" + "0 OK Done.\r\n"
    command: (test) ->
      cl.expunge (err, ids) ->
        test.ok not err, "No command errors"
        test.deepEqual ids, [3, 4, 7, 11]
        test.done()

  search: cmd
    write: "0 SEARCH FLAGGED\r\n"
    resp: "* SEARCH 2 84 882\r\n" + "0 OK Done.\r\n"
    command: (test) ->
      crit = 'FLAGGED'
      cl.search 'UTF8', crit, (err, ids) ->
        test.ok not err, "No command errors"
        test.deepEqual ids, [2, 84, 882]
        test.done()

  fetch: cmd
    write: "0 FETCH 2:4 (ALL)\r\n"
    resp: "\r\n" + "0 OK Done.\r\n"
    command: (test) ->
      crit = 'ALL'
      cl.fetch 2, 4, crit, (err, resp) ->
        test.ok not err, "No command errors"
        test.done()

  store: cmd
    write: "0 STORE 2:4 +FLAG (\\Fg)"
    resp: "* 2 FETCH (FLAGS (\\Fg))\r\n" +
          "* 3 FETCH (FLAGS (\\Fg))\r\n" +
          "* 4 FETCH (FLAGS (\\Fg))\r\n" + "0 OK Done.\r\n"
    command: (test) ->
      cl.store 2, 4, 'add', ['\\Fg'], (err, flags) ->
        test.ok not err, "No command errors"
        test.deepEqual flags,
          '2': ['\\Fg']
          '3': ['\\Fg']
          '4': ['\\Fg']
        test.done()

  copy: cmd
    write: "0 COPY 2:4 \"INBOX\"\r\n"
    resp: "0 OK Done.\r\n"
    command: (test) ->
      cl.copy 2, 4, (err) ->
        test.ok not err, "No command errors"
        test.done()




