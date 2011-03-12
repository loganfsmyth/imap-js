

build: imap_parser.cc imap_parser.h node_imap_parser.cc
	node-waf configure && node-waf build
