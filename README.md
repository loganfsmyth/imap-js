
# NodeJS Javascript/C IMAP Client

This is an IMAP library meant to implement the full set of IMAP commands
specified in RFC 3501 as specified here: http://www.faqs.org/rfcs/rfc3501.html 
Basic wrappers will also be provided, building on top of the standard commands, 
to allow for object-oriented access to mailboxes and messages.

The objective of this project is to write a fast parser for the IMAP protocol 
by taking the complex tokenizing step out of javascript and moving it to C, while 
keeping the object generation and general client libraries in Javascript for simplicity.

# API

## ImapClient

ImapClient(host, port, security, /* options*/ , cb)

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
* append( mailbox, message, flags, datetime )
* check()
* close()
* expunge()
* search( criteria, charset, uid )
* fetch( seqset, items, uid )
* store( seqset, action, flags, uid )
* copy( seqset, mailbox, uid )


# Current Status

All IMAP commands are defined, and return properly, but character-set conversion 
have not been implemented in most places. Because there is still work to be done
at the lower level, the object-oriented wrappers remain as a TODO for the time being.

# License

Copyright (c) 2011 Logan Falconer Smyth
Dual licensed under the MIT and GPL licenses.
See MIT-LICENSE.txt and GPL-LICENSE.txt
