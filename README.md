
# NodeJS IMAP Client

This is an IMAP library meant to implement the full set of IMAP commands
specified in RFC 3501 as specified here: http://www.faqs.org/rfcs/rfc3501.html 

# API

## ImapClient

ImapClient(options)

* capability()
* noop()
* logout()
* starttls()
* authenticate() // TODO
* login( user, pass )
* select( mailbox )
* examine( mailbox )
* create( mailbox )
* delete( mailbox )
* rename( mailbox, newmailbox )
* subscribe( mailbox )
* unsubscribe( mailbox )
* list( refname, mailbox )
* lsub( refname, mailbox )
* status( mailbox, items )
* append( mailbox, flags, datetime, bytes, /*readstream*/)
* check()
* close()
* expunge()
* search( criteria, uid )
* fetch( seqset, items, uid )
* store( seqset, action, flags, uid )
* copy( seqset, mailbox, uid )


# TODO

* All the standard IMAP commands work except for authenticate, but the client still needs to be tested under real usage.
* Add some basic wrappers to make it easier to use the client.
* Add support for extensions based on server capabilities
* Re-implement the parser, possibly in C. Attempted with some success, but it was too unmaintainable.

# License

Copyright (c) 2011 Logan Falconer Smyth
Dual licensed under the MIT and GPL licenses.
See MIT-LICENSE.txt and GPL-LICENSE.txt
