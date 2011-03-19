

#include "imap_parser.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>


enum parser_state {
  s_parse_error = 1,
  s_response_start,
  s_continue_req,
  s_capability_data_start,
  s_capability_data_arg,
  s_capability_data_arg_start,
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
  s_resp_text_code_start,
  s_resp_text_code,
  s_resp_text_code_almost_done,
  s_resp_text_code_done,
  s_resp_text_code_atom,
  s_resp_text_code_atom_test,
  s_resp_text_code_badcharset_args_start,
  s_resp_text_code_badcharset_args_done,
  s_text_start,
  s_text,

  s_astring_start,
  s_astring,
  s_literal_start,
  s_quoted_start,

  s_nz_number,
  s_flag_permanent,

};

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
  STR_AUTH_EQ,

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
  "AUTH=",

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

#define PRN(str, start, end)   \
do {    \
  char* to = strndup(start, (end-start)); \
  printf(str " => %s\n", to);   \
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

  const char* str_start = data;

  size_t amount;

  for (p = data, pe = data+len; p != pe; p++ ) {
    c = *p;

    switch(state) {

      // Start of ( continue-req / response-data / response-tagged )
      case s_response_start:
        switch (c) {
          case '+':  state = s_continue_req;  ERR(); break;
          case '*':  state = s_response_data;  ERR(); break;
          default :  state = s_response_tagged_start;  break;
        }
        p--;
        break;

      // Start of ( tag SP resp-code-state CRLF )
      case s_response_tagged_start:

      // Start of ( 1*<STRING-CHAR except "+"> )
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
            PRN("TAG", str_start, p);
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

      // Start of ("OK" / "NO" / "BAD") SP resp-text
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
            PRN("TYPE", str_start, p);
            break;
          }
          else if (str[index] != c) {
            ERR();
          }
        }
        index++;
        break;

      // Start of ["[" resp-text-code "]" SP] text
      case s_resp_text_start:
        index = 0;
        // fall through
      case s_resp_text:
        if (c == '[') state = s_resp_text_code_start;
        else state = s_text_start;
        p--;
        break;

      /**
       * Start of ("ALERT" / "BADCHARSET" [SP "(" astring *(SP astring) ")"] / capability-data / "PARSE" /
       *           "PERMANENTFLAGS" SP "(" [flag-perm *(flag-perm)] ")" / "READ-ONLY" / "READ-WRITE" / "TRYCREATE" /
       *           "UIDNEXT" SP nz-number / "UIDVALIDITY" SP nz-number /
       *           "UNSEEN" SP nz-number / atom [SP 1*<any TEXT-CHAR except "]"]
       */
      case s_resp_text_code_start:
        // starts at '['
        index = 0;
        state = s_resp_text_code;
        break;
      case s_resp_text_code:
        switch (index) {
          case 0:
            str_start = p;

            switch (c) {
              case 'A': cur_string = STR_ALERT;   break;
              case 'P': cur_string = STR_PARSE;   break;    // PARSE or PERMANENTFLAGS
              case 'R': cur_string = STR_READ_ONLY; break;  // READ-ONLY or READ-WRITE
              case 'T': cur_string = STR_TRYCREATE; break;
              case 'U': cur_string = STR_UIDNEXT; break;    // UIDNEXT or UIDVALIDITY or UNSEEN
              case 'B': cur_string = STR_BADCHARSET; break;
              case 'C': cur_string = STR_CAPABILITY; break;
              default: cur_string = STR_UNKNOWN; break; // for atom strings
            }
            break;
          case 1:
            switch (c) {
              case 'E':
                if (cur_string == STR_PARSE) {
                  cur_string = STR_PERMANENTFLAGS;
                }
                break;
              case 'N':
                if (cur_string == STR_UIDNEXT) {
                  cur_string = STR_UNSEEN;
                }
                break;
            }
            break;
          case 3:
            if (c == 'V' && cur_string == STR_UIDNEXT) {
              cur_string = STR_UIDVALIDITY;
            }
            break;
          case 5:
            if (c == 'W' && cur_string == STR_READ_ONLY) {
              cur_string = STR_READ_WRITE;
            }
        }

        if (cur_string != STR_UNKNOWN) {
          str = strings[cur_string];

          if (str[index] == '\0' && (c == ' ' || c == ']')) {
            switch (cur_string) {
              case STR_BADCHARSET:
                if (c == ' ') {
                  state = s_resp_text_code_badcharset_args_start;
                  break;
                }
              case STR_ALERT:
              case STR_READ_ONLY:
              case STR_READ_WRITE:
              case STR_PARSE:
              case STR_TRYCREATE:
                if (c == ' ') ERR();
                state = s_text_start;
                PRN("TEXTCODE", str_start, p);
                break;
              case STR_UIDNEXT:
              case STR_UIDVALIDITY:
              case STR_UNSEEN:
                if (c == ']') ERR();
                state = s_nz_number;
                PRN("TEXTCODE", str_start, p);
                break;
              case STR_PERMANENTFLAGS:
                state = s_flag_permanent;
                break;
              case STR_CAPABILITY:
                state = s_capability_data_arg_start;
                break;
              default:
                state = s_resp_text_code_atom_test;
                break;
            }
          }
          else if (str[index] != c) {
            state = s_resp_text_code_atom_test;
          }

          index++;
        }
        break;

      case s_resp_text_code_almost_done:
        if (c != ']') ERR();
        state = s_resp_text_code_done;
        break;
      case s_resp_text_code_done:
        if (c != ' ') ERR();
        state = s_text_start;
        break;

      // Parse badcharset args: "(" astring *(SP astring) ")"
      case s_resp_text_code_badcharset_args_start:
        if (c != '(') ERR();
        state = s_astring_start;
        break;
      case s_resp_text_code_badcharset_args_done:
        if (c == ' ') {
          state = s_astring_start;
        }
        else {
          if (c != ')') ERR();
          state = s_resp_text_code_almost_done;
        }
        break;

      // Parse capability args *(SP atom)
      case s_capability_data_start:
        if (c != ' ') {
          state = s_resp_text_code_done; // TODO: this needs to be different for untagged
        }
        else {
          state = s_capability_data_arg_start;
        }
        break;
      case s_capability_data_arg_start:
        str_start = p;
        index = 0;
        if (!IS_ATOM_CHAR(c)) {
          ERR();
        }
        state = s_capability_data_arg;
        break;
      case s_capability_data_arg:
        if (!IS_ATOM_CHAR(c)) {
          state = s_capability_data_start;
          PRN("CAP", str_start, p);
          p--;
        }
        break;

      case s_resp_text_code_atom_test:

      case s_resp_text_code_atom:
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
            PRN("TEXT", str_start, p);

            index = 0;
            p--;
            state = next_state;
            break;
          }
        }
        index++;
        break;

      case s_astring_start:
        switch (c) {
          case '{': state = s_literal_start; break;
          case '"': state = s_quoted_start; break;
          default:
            if (!IS_ASTRING_CHAR(c)) ERR();
            state = s_astring;
            str_start = p;
            break;
        }
        p--;
        break;

      case s_astring:
        if (!IS_ASTRING_CHAR(c)) {
          PRN("ASTRING", str_start, p);
          state = s_resp_text_code_badcharset_args_done;
          p--;
        }
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

  parser->state = state;
  parser->next_state = next_state;
  parser->index = index;
  parser->cur_string = cur_string;
  parser->last_char = last_char;

//  parser->state = s_parse_error;
  return (p-data);
}

