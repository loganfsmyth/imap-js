

#include "imap_parser.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>


enum parser_state {
  s_parse_error = 1,
  s_response_start,
  s_continue_req,
  s_response_data,
  s_response_tagged_start,
  s_tag_start,
  s_tag,
  s_response_tagged_mid,
  s_resp_cond_state,
  s_check_crlf,
  s_check_lf,
  s_resp_text,
  s_resp_text_start,
  s_resp_text_code,
  s_text_start,
  s_text,

};

#define NEXT_STATE_PUSH(s) parser->next_states[parser->num_next_states++] = (unsigned char)s;
#define NEXT_STATE_POP() (enum parser_state)parser->next_states[--parser->num_next_states];
//#define STATE_CUR() (enum parser_state)parser->state[parser->num_states-1];
//#define STATE_SET(s) parser->state[parser->num_states-1] = s;

#define EXPECT(character) if (c != character) ERR()
#define GIVEN(cond, st) if (cond) state = st
#define ERR() goto parse_error

enum string_ref {
  STR_UNKNOWN = 0,
  STR_OK,
  STR_NO,
  STR_BAD,
  STR_BYE,
  STR_ALERT,
  STR_BADCHARSET,
  STR_CAPABILITY,
  STR_PARSE,
  STR_READ_ONLY,
  STR_TRYCREATE,
  STR_UIDNEXT,
  STR_PERMANENTFLAGS,
  STR_READ_WRITE,
  STR_UIDVALIDITY,
  STR_UNSEEN,

};


static const char *strings[] = {
  "",
  "OK",
  "NO",
  "BAD",
  "BYE",
  "ALERT",
  "BADCHARSET",
  "CAPABILITY",
  "PARSE",
  "READ-ONLY",
  "TRYCREATE",
  "UIDNEXT",
  "PERMANENTFLAGS",
  "READ-WRITE",
  "UIDVALIDITY",
  "UNSEEN",

};


#define IS_ALPHA(c) ( (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) )
#define IS_DIGIT(c) (c >= 0x30 && c <= 0x39)
#define IS_HEXDIG(c) (IS_DIGIT(c) || (c >= 0x41 && c  <= 0x50))
#define IS_DQUOTE(c) (c == 0x22)
#define IS_SP(c) (c == 0x20)
#define IS_HTAB(c) (c == 0x09)
#define IS_WSP(c) (IS_SP(c) || IS_HTAB(c))
#define IS_VCHAR(c) (c >= 0x21 && c <= 0x7E)
#define IS_CHAR(c) (c > 0x01 && c <= 0x7F)
#define IS_OCTET(c) (c >= 0x00 && c <= 0xFF)
#define IS_CTL(c) (c <= 0x1F || c == 0x7F)
#define IS_CR(c) (c == 0x0D)
#define IS_LF(c) (c == 0x0A)

#define IS_CHAR8(c) (c >= 0x01 && c <= 0xFF)

#define IS_TEXT_CHAR(c) (c != '\n' && c != '\r' && IS_CHAR(c))
#define IS_RESP_SPECIAL(c) (c == ']')
#define IS_QUOTED_SPECIAL(c) (c == '\\' || c == '"')
#define IS_LIST_WILDCARD(c) (c == '%' || c == '*')
#define IS_ATOM_SPECIAL(c) (c == '(' || c == ')' || c == '{' || c == ' ' || IS_CTL(c) || IS_RESP_SPECIAL(c) || IS_QUOTED_SPECIAL(c) || IS_LIST_WILDCARD(c))
#define IS_ATOM_CHAR(c) (IS_CHAR(c) && !IS_ATOM_SPECIAL(c))
#define IS_ASTRING_CHAR(c) (IS_RESP_SPECIAL(c) || IS_ATOM_CHAR(c))

//#define IS_QUOTED_CHAR(c, prev) ((IS_TEXT_CHAR(c) && !IS_QUOTED_SPECIAL(c)) || (prev == '\\' && IS_QUOTED_SPECIAL(c)))

#define PRN(start, end)   \
do {    \
  char* to = strndup(start, (end-start)); \
  printf("%s\n", to);   \
  free(to);     \
} while(0)      


void imap_parser_init(imap_parser* parser) {
  parser->state = s_response_start;
  parser->next_state = s_parse_error; // if we pop too much, get a parse error :)
  parser->cur_string = STR_UNKNOWN;
  parser->index = 0;
  parser->last_char = '\0';
}


size_t imap_parser_execute(imap_parser* parser, imap_parser_settings* settings, const char* data, size_t len) {

  enum parser_state state = (enum parser_state)parser->state;
  enum parser_state next_state = (enum parser_state)parser->next_state;
  unsigned int index = parser->index;
  enum string_ref cur_string = (enum string_ref)parser->cur_string;
  char last_char = parser->last_char;

  unsigned int bytes_remaining = -1;
  char done;

  char c;
  const char *p, *pe, *str;

  const char* str_start;

  size_t amount;

  for (p = data, pe = data+len; p != pe; p++ ) {
    c = *p;

    switch(state) {
      case s_response_start:
        switch (c) {
          case '+':  state = s_continue_req;  ERR(); break;
          case '*':  state = s_response_data;  ERR(); break;
          default :  state = s_response_tagged_start;  break;
        }
        p--;
        break;
      case s_response_tagged_start:
      case s_tag_start:
        index = 0;
        state = s_tag;
        str_start = p;
        // fall through
      case s_tag:
        if (IS_ASTRING_CHAR(c) && c != '+') {
          index++;
        }
        else {
          if (index == 0) ERR();
          else {
            printf("TAG => ");
            PRN(str_start, p);
            state = s_response_tagged_mid;
            p--;
          }
        }
        break;

      case s_response_tagged_mid:
        index = 0;
        if (c != ' ') ERR();
        state = s_resp_cond_state;
        next_state = s_check_crlf;
        break;

      case s_resp_cond_state:
        if (index == 0) {
          str_start = p;
          switch (c) {
            case 'O': cur_string = STR_OK;  break;
            case 'N': cur_string = STR_NO;  break;
            case 'B': cur_string = STR_BAD; break;
          }
        }
        else {
          str = strings[cur_string];
          if (c == ' ' && str[index] == '\0') {
            state = s_resp_text_start;
            printf("TYPE => ");
            PRN(str_start, p);
            break;
          }
          else if (str[index] != c) {
            ERR();
          }
        }
        index++;
        break;


      case s_resp_text_start:
        index = 0;
        // fall through
      case s_resp_text:
        if (c == '[') state = s_resp_text_code;
        else state = s_text_start;
        p--;
        break;

      case s_resp_text_code:
        if (last_char == ']' && c == ' ') {
          state = s_text_start;
        }
        break;

      case s_text_start:
        index = 0;
        str_start = p;
        state = s_text;

        // fall through
      case s_text:
        if (!IS_TEXT_CHAR(c)) {
          if (index == 0) ERR();
          else {
            printf("TEXT => ");
            PRN(str_start, p);

            index = 0;
            p--;
            state = next_state;
            break;
          }
        }
        index++;
        break;

      case s_check_crlf:
        if (c == '\r') {
          state = s_check_lf;
          break;
        }
      case s_check_lf:
        if (c == '\n') {
          state = s_response_start;
        }
        else {
          ERR();
        }
        break;
    }

    last_char = c;
  }

  parser->state = state;
  parser->next_state = next_state;
  parser->index = index;
  parser->cur_string = cur_string;
  parser->last_char = last_char;

  return len;

parse_error:
//  parser->state = s_parse_error;
  return (p-data);
}

