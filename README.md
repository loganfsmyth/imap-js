
# NodeJS Javascript/C IMAP Client #

This is an IMAP library meant to implement the full set of IMAP commands specified in RFC 3501 as specified here: http://www.faqs.org/rfcs/rfc3501.html Basic wrappers will also be provided, building on top of the standard commands, to allow for object-oriented access to mailboxes and messages.

The objective of this project is to write a fast parser for the IMAP protocol by taking the complex tokenizing step out of javascript and moving it to C, while keeping the object generation and general client libraries in Javascript for simplicity. 

# Current Status #

All IMAP commands are defined, and return properly, but parsing of responses has not been implemented yet. Similarly, arguments are not necessarily handled properly, and character-set conversion has not been implemented in most places. Because there is still work to be done at the lower level, the object-oriented wrappers remain as a TODO for the time being.
