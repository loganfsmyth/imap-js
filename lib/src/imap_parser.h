

#ifndef __IMAP_PARSER_H
#define __IMAP_PARSER_H

#ifdef __cplusplus
extern "C" {
#endif

#include <sys/types.h>

enum parser_types {
  PARSER_GREETING = 1,
  PARSER_RESPONSE,
  PARSER_COMMAND,
};

enum data_types {
  IMAP_NONE = 0,
  IMAP_TAG,
  IMAP_STATE,
  IMAP_CAPABILITY,
  IMAP_TEXT,
  IMAP_QUOTED,
  IMAP_LITERAL,
  IMAP_FLAG,
  IMAP_TEXTCODE,
  IMAP_ASTRING,
  IMAP_NUMBER,
  IMAP_RESPONSE,
  IMAP_BASE64,
};


#define IMAP_STACK_SIZE 40
struct imap_parser {
  unsigned char state[IMAP_STACK_SIZE];
  unsigned int current_state;

  unsigned char cur_string;
  unsigned char str_state;

  unsigned int last_char;
  unsigned int index;
  unsigned int bytes_remaining;

  void* data;
};
#define PUSH_STATE(st) parser->state[parser->current_state++] = st
#define POP_STATE() parser->state[--parser->current_state]
#define PEEK_STATE() parser->state[parser->current_state-1]
#define SET_STATE(st) parser->state[parser->current_state-1] = st


typedef int (*imap_data_cb) (imap_parser*, const char*, size_t, unsigned int);
typedef int (*imap_cb) (imap_parser*, unsigned int);

struct imap_parser_settings {
  imap_data_cb on_data;
  imap_cb on_done;
};


void imap_parser_init(imap_parser* parser, enum parser_types type);
size_t imap_parser_execute(imap_parser* parser, imap_parser_settings* settings, const char* data, size_t len);



#ifdef __cplusplus
}
#endif

#endif
