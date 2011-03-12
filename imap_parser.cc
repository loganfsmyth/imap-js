

#include "imap_parser.h"

#include <stdio.h>
#include <stdlib.h>

void imap_parser_init(imap_parser* parser) {

}


size_t imap_parser_execute(imap_parser* parser, imap_parser_settings* settings, const char* data, size_t len) {

  char* copy = (char*)malloc(len+1);
  for(int i = 0; i < (int)len; i++) {
    copy[i] = data[i];
  }
  copy[len] = '\0';

  printf(copy);

  return len;
}

