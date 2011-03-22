

#ifndef __IMAP_PARSER_H
#define __IMAP_PARSER_H

#ifdef __cplusplus
extern "C" {
#endif

#include <sys/types.h>

struct imap_parser {
  unsigned char state;
  unsigned char next_state;

  unsigned char cur_string;
  unsigned char str_state;


  unsigned int last_char;
  unsigned int index;

  void* data;
};

typedef int (*imap_data_cb) (imap_parser*, const char*, size_t);
typedef int (*imap_cb) (imap_parser*);

struct imap_parser_settings {

};


void imap_parser_init(imap_parser* parser);
size_t imap_parser_execute(imap_parser* parser, imap_parser_settings* settings, const char* data, size_t len);



#ifdef __cplusplus
}
#endif

#endif
