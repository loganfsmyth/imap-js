

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
  IMAP_TEXT,
  IMAP_QUOTED,
  IMAP_LITERAL,
  IMAP_LITERAL_SIZE,
  IMAP_ASTRING,
  IMAP_NUMBER,
  IMAP_BASE64,
  IMAP_TEXT_OR_BASE64,
  IMAP_DATETIME,
  IMAP_NIL,
  IMAP_ATOM,

  IMAP_LIST,
  IMAP_RESP_TEXT,
  IMAP_MSG_ATT,
  IMAP_BODY,
  IMAP_ENVELOPE,
  IMAP_ADDRESS,

  IMAP_COMMAND_RESPONSE,
  IMAP_GREETING_RESPONSE,
  IMAP_TAGGED_RESPONSE,
  IMAP_UNTAGGED_RESPONSE,
  IMAP_CONTINUE_RESPONSE,
};


#define IMAP_STACK_SIZE 40
struct imap_parser {
  unsigned char state[IMAP_STACK_SIZE];
  unsigned int current_state;

  unsigned char cur_string;
  unsigned char str_state;

  unsigned int last_char;
  unsigned int ch;
  unsigned int index;
  unsigned int bytes_remaining;

  char parsing;
  char type;

  void* data;
};
#define PUSH_STATE(st) \
do { \
  parser->state[parser->current_state++] = st;    \
  if (parser->current_state >= IMAP_STACK_SIZE) {  \
    printf("OVERFLOW\r\n\r\n");            \
  }   \
} while(0)


#define PUSH_PREV_STATE() parser->current_state++;
#define POP_STATE() parser->state[--parser->current_state]
#define PEEK_STATE() parser->state[parser->current_state-1]
#define SET_STATE(st) parser->state[parser->current_state-1] = st


typedef int (*imap_data_cb) (imap_parser*, const char*, size_t, unsigned int);
typedef int (*imap_cb) (imap_parser*, unsigned int);

struct imap_parser_settings {
  imap_cb on_start;
  imap_data_cb on_data;
  imap_cb on_done;
};


void imap_parser_init(imap_parser* parser, enum parser_types type);
size_t imap_parser_execute(imap_parser* parser, imap_parser_settings* settings, const char* data, size_t len);



#ifdef __cplusplus
}
#endif

#endif
