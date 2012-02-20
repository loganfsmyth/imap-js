
COFFEE_SRC = \
  src/*.coffee


build: build_coffee build_docs

watch_coffee: ${COFFEE_SRC}
	coffee --compile --watch --output lib/ ${COFFEE_SRC}

build_coffee: ${COFFEE_SRC}
	coffee --compile --output lib/ ${COFFEE_SRC}

build_docs: ${COFFEE_SRC}
	docco ${COFFEE_SRC}
