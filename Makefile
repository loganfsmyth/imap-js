
build: build_native build_coffee

watch_coffee: src/imap-client.coffee src/imap-parser.coffee
	coffee --compile --watch --output lib/ src/imap-client.coffee src/imap-parser.coffee

build_coffee: src/imap-client.coffee src/imap-parser.coffee
	coffee --compile --output lib/ src/imap-client.coffee src/imap-parser.coffee

build_native: src/imap_parser.cc src/imap_parser.h src/node_imap_parser.cc
	cd src && node-waf configure && node-waf build
