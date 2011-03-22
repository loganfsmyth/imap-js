

build: lib/src/imap_parser.cc lib/src/imap_parser.h lib/src/node_imap_parser.cc
	cd lib/src && node-waf configure && node-waf build
