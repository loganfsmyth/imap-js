(function() {
  var b, tests;

  b = function(s) {
    return s;
  };

  tests = {
    "* OK word\n": {
      'type': 'OK',
      'text-code': null,
      'text': b('word')
    },
    "* NO word\n": {
      'type': 'NO',
      'text-code': null,
      'text': b('word')
    },
    "* BAD word\n": {
      'type': 'BAD',
      'text-code': null,
      'text': b('word')
    },
    "* BYE word\n": {
      'type': 'BYE',
      'text-code': null,
      'text': b('word')
    },
    "* CAPABILITY IMAP4rev1 AUTH=PLAIN\n": {
      'type': 'CAPABILITY',
      'value': [b('IMAP4rev1'), b('AUTH=PLAIN')]
    },
    "* FLAGS ()\n": {
      'type': 'FLAGS',
      'value': []
    },
    "* FLAGS (\\Unseen \\Answered)\n": {
      'type': 'FLAGS',
      'value': [b('\\Unseen'), b('\\Answered')]
    },
    "* LIST () \"/\" INBOX\n": {
      'type': 'LIST',
      'value': {
        'flags': [],
        'char': b('/'),
        'mailbox': b('INBOX')
      }
    },
    "* LIST (\\Marked \\Noselect) \"G\" INBOX\n": {
      'type': 'LIST',
      'value': {
        'flags': [b('\\Marked'), b('\\Noselect')],
        'char': b('G'),
        'mailbox': b('INBOX')
      }
    },
    "* LIST (\\Marked \\Noselect) NIL INBOX\n": {
      'type': 'LIST',
      'value': {
        'flags': [b('\\Marked'), b('\\Noselect')],
        'char': null,
        'mailbox': b('INBOX')
      }
    },
    "* LSUB () NIL otherbox\n": {
      'type': 'LSUB',
      'value': {
        'flags': [],
        'char': null,
        'mailbox': b('otherbox')
      }
    },
    "* SEARCH\n": {
      'type': 'SEARCH',
      'value': []
    },
    "* SEARCH 0\n": null,
    "* SEARCH 1\n": {
      'type': 'SEARCH',
      'value': [1]
    },
    "* SEARCH 1 2 3 4\n": {
      'type': 'SEARCH',
      'value': [1, 2, 3, 4]
    },
    "* STATUS INBOX ()\n": {
      'type': 'STATUS',
      'value': {
        'mailbox': b('INBOX'),
        'attributes': {}
      }
    },
    "* STATUS INBOX (MESSAGES 5 RECENT 6 UIDNEXT 7)\n": {
      'type': 'STATUS',
      'value': {
        'mailbox': b('INBOX'),
        'attributes': {
          'MESSAGES': 5,
          'RECENT': 6,
          'UIDNEXT': 7
        }
      }
    },
    "* 5 RECENT\n": {
      'type': 'RECENT',
      'id': 5,
      'value': null
    },
    "* 5 EXISTS\n": {
      'type': 'EXISTS',
      'id': 5,
      'value': null
    },
    "* 0 EXPUNGE\n": null,
    "* 3 EXPUNGE\n": {
      'type': 'EXPUNGE',
      'id': 3,
      'value': null
    },
    "* 5 FETCH ()\n": null,
    "* 0 FETCH (FLAGS ())\n": null,
    "* 5 FETCH (FLAGS ())\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('FLAGS'),
          'value': []
        }
      ]
    },
    "* 5 FETCH (FLAGS (\\Unanswered \\Marked))\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('FLAGS'),
          'value': [b('\\Unanswered'), b('\\Marked')]
        }
      ]
    },
    "* 5 FETCH (ENVELOPE (\"date\" \"subject\" NIL NIL NIL NIL NIL NIL NIL NIL))\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('ENVELOPE'),
          'value': {
            'date': b('date'),
            'subject': b('subject'),
            'from': null,
            'sender': null,
            'reply-to': null,
            'to': null,
            'cc': null,
            'bcc': null,
            'in-reply-to': null,
            'message-id': null
          }
        }
      ]
    },
    "* 5 FETCH (ENVELOPE (\"date\" \"subject\" ((\"name\" \"adl\" \"mailbox\" \"host\")(\"name2\" \"adl2\" \"mailbox2\" \"host2\")) NIL NIL NIL NIL NIL NIL NIL))\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('ENVELOPE'),
          'value': {
            'date': b('date'),
            'subject': b('subject'),
            'from': [
              {
                'name': b('name'),
                'adl': b('adl'),
                'mailbox': b('mailbox'),
                'host': b('host')
              }, {
                'name': b('name2'),
                'adl': b('adl2'),
                'mailbox': b('mailbox2'),
                'host': b('host2')
              }
            ],
            'sender': null,
            'reply-to': null,
            'to': null,
            'cc': null,
            'bcc': null,
            'in-reply-to': null,
            'message-id': null
          }
        }
      ]
    },
    "* 5 FETCH (INTERNALDATE \"10-Jan-2012 12:11:10 -0500\")\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('INTERNALDATE'),
          'value': new Date('10-Jan-2012 12:11:10 -0500')
        }
      ]
    },
    "* 5 FETCH (RFC822 \"rfc\")\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('RFC822'),
          'value': b('rfc')
        }
      ]
    },
    "* 5 FETCH (RFC822.HEADER \"rfc\")\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('RFC822.HEADER'),
          'value': b('rfc')
        }
      ]
    },
    "* 5 FETCH (RFC822.TEXT \"rfc\")\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('RFC822.TEXT'),
          'value': b('rfc')
        }
      ]
    },
    "* 5 FETCH (RFC822.SIZE 10000)\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('RFC822.SIZE'),
          'value': 10000
        }
      ]
    },
    "* 5 FETCH (BODYSTRUCTURE (\"type\" \"subtype\" \"md5\" (\"name\" (\"key\" \"val\" \"key2\" \"value2\")) \"lang\" \"loc\" (\"ext\" 14)))\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('BODYSTRUCTURE'),
          'value': {
            'type': b('type'),
            'subtype': b('subtype'),
            'md5': b('md5'),
            'dsp': {
              'name': b('name'),
              'values': [
                {
                  'key': b('key'),
                  'value': b('val')
                }, {
                  'key': b('key2'),
                  'value': b('value2')
                }
              ]
            },
            'lang': b('lang'),
            'loc': b('loc'),
            'ext': [b('ext'), 14]
          }
        }
      ]
    },
    "* 5 FETCH (UID 10)\n": {
      'type': 'FETCH',
      'id': 5,
      'value': [
        {
          'type': b('UID'),
          'value': 10
        }
      ]
    }
  };

  module.exports = require('./helper').genTests('untagged', tests);

}).call(this);
