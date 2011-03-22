

build: lib/imap_parser.cc lib/imap_parser.h lib/node_imap_parser.cc
	cd lib && node-waf configure && node-waf build
