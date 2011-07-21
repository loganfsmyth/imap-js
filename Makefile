
COFFEE_SRC = \
  src/imap-client.coffee    \
  src/imap-parser.coffee    \
  src/imap-mailbox.coffee   \
  src/imap-messageset.coffee\
  src/imap-connection.coffee


C_SRC = \
  src/imap_parser.cc        \
  src/imap_parser.h         \
  src/node_imap_parser.cc


build: build_native build_coffee build_docs

watch_coffee: ${COFFEE_SRC}
	coffee --compile --watch --output lib/ ${COFFEE_SRC}

build_coffee: ${COFFEE_SRC}
	coffee --compile --output lib/ ${COFFEE_SRC}

build_native: ${C_SRC}
	cd src && node-waf configure && node-waf build

build_docs: ${COFFEE_SRC}
	docco ${COFFEE_SRC}
