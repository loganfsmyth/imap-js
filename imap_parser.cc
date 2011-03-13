

#include "imap_parser.h"

#include <stdio.h>
#include <stdlib.h>


enum parser_state {
  s_parse_error = 1,
  s_response_start,
  s_response_data,
  s_response_data_options,
  s_response_data_end,
  s_response_done,
  s_response_fatal,
  s_response_tagged,
  s_response_data_crlf,

  s_resp_cond_state,
  s_resp_cond_bye,
  s_resp_text,
  s_resp_text_code,
  s_resp_text_code_flag_perm,
  s_resp_text_code_atom,
  s_resp_text_code_badcharset,
  s_resp_text_code_badcharset_str,
  s_resp_text_code_permanentflags,
  s_resp_text_code_u,
  s_resp_text_code_done,
  s_text,

  s_capability_data,
  s_mailbox_data,
  s_resp_state_or_bye,
  s_resp_mailbox_or_message_data,



  s_continue_req,

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

#define IS_CHAR(c) (c > 0x01 && c <= 0x7F)
#define IS_CTL(c) (c <= 0x1F || c == 0x7F)
#define IS_DQUOTE(c) (c == 0x22)
#define IS_DIGIT(c) (c >= 0x30 && c <= 0x39)
#define IS_SP(c) (c == 0x20)
#define IS_CR(c) (c == 0x0D)
#define IS_LF(c) (c == 0x0A)

#define IS_CHAR8(c) (c != 0x00)


#define IS_TEXT_CHAR(c) (c != '\n' && c != '\r' && IS_CHAR(c))
#define IS_RESP_SPECIAL(c) (c == ']')
#define IS_QUOTED_SPECIAL(c) (c == '\\' || c == '"')
#define IS_LIST_WILDCARD(c) (c == '%' || c == '*')

#define IS_ATOM_SPECIAL(c) (c == '(' || c == ')' || c == '{' || c == ' ' || IS_CTL(c) || IS_RESP_SPECIAL(c) || IS_QUOTED_SPECIAL(c) || IS_LIST_WILDCARD(c))
#define IS_ATOM_CHAR(c) (IS_CHAR(c) && !IS_ATOM_SPECIAL(c))
#define IS_ASTRING_CHAR(c) (IS_RESP_SPECIAL(c) || IS_ATOM_CHAR(c))
#define IS_QUOTED_CHAR(c, prev) ((IS_TEXT_CHAR(c) && !IS_QUOTED_SPECIAL(c)) || (prev == '\\' && IS_QUOTED_SPECIAL(c)))


enum string_state {
  str_none = 0,
  str_astring,

  str_quoted_char,
  str_quoted_escaped,

  str_literal_len,
  str_literal_crlf,
  str_literal_data,
  str_nstring,
};


#define STR_LITERAL(c)                                                                              \
  case str_literal_len:                                                                             \
    if (bytes_remaining == -1) {                                                                    \
      if(!IS_DIGIT(c)) ERR(); /* empty {} */                                                        \
      else bytes_remaining = 0;                                                                     \
    }                                                                                               \
    if (IS_DIGIT(c)) {                                                                              \
      bytes_remaining *= 10;                                                                        \
      bytes_remaining += c-'0';                                                                     \
    }                                                                                               \
    else if (c == '}') {                                                                            \
      str_state = str_literal_crlf;                                                                 \
    }                                                                                               \
    else ERR();                                                                                     \
    break;                                                                                          \
  case str_literal_crlf:                                                                            \
    if (c == '\r' && index == 0) {                                                                  \
      index++;                                                                                      \
    }                                                                                               \
    else if (c == '\n') {                                                                           \
      index = 0;                                                                                    \
      str_state = (bytes_remaining > 0)?str_literal_data:str_none; /* TODO MAYBE event w/ no data?*/\
    }                                                                                               \
    break;                                                                                          \
  case str_literal_data:                                                                            \
    amount = (bytes_remaining > pe-p)?(pe-p):bytes_remaining;                                       \
    if (amount > 0) {                                                                               \
      /* TODO: astring EVENT from p to amount */                                                    \
      p += amount-1;                                                                                \
      bytes_remaining -= amount;                                                                    \
      if (bytes_remaining == 0) {                                                                   \
        done = 1;                                                                                   \
        str_state = str_none;                                                                       \
      }                                                                                             \
    }                                                                                               \
    break;

#define STR_QUOTED(c)                                     \
  case str_quoted_char:                                   \
    if (index == 1) {                                     \
      /* TODO Mark start */                               \
    }                                                     \
    if (c == '\\') str_state = str_quoted_escaped;        \
    else if (c == '"') {                                  \
      /* Event from start */                              \
      done = 1;                                           \
      str_state = str_none;                               \
    }                                                     \
    else if (!IS_TEXT_CHAR(c) || IS_QUOTED_SPECIAL(c)) {  \
      ERR();                                              \
    }                                                     \
    break;                                                \
  case str_quoted_escaped:                                \
    if (IS_QUOTED_SPECIAL(c)) str_state = str_quoted_char;\
    else ERR();                                           \
    break;


#define STR_ASTRING_CHARS(c)    \
  case str_astring:             \
    if (index == 1) {           \
      /* MARK Start */          \
    }                           \
    if (!IS_ASTRING_CHAR(c)) {  \
      if (index == 0) ERR();    \
      else {                    \
        done = 1;               \
        /* AString Event */     \
        str_state = str_none;   \
        p -= 1;  /*repeat*/     \
      }                         \
    }                           \
    index++;


#define ASTRING(c)                  \
  done = 0;                         \
  if (index == 0) {                 \
    if (IS_DQUOTE(c)) {             \
      str_state = str_quoted_char;  \
      break;                        \
    }                               \
    else if (c == '{') {            \
      str_state = str_literal_len;  \
      break;                        \
    }                               \
    else {                          \
      str_state = str_astring;      \
    }                               \
                                    \
    index++;                        \
  }                                 \
  switch (str_state) {              \
    STR_LITERAL(c);                 \
    STR_QUOTED(c);                  \
    STR_ASTRING_CHARS(c);           \
    case str_nstring:               \
    case str_none:                  \
      break;                        \
  }




void imap_parser_init(imap_parser* parser) {
  parser->num_next_states = 0;
  NEXT_STATE_PUSH(s_parse_error); // if we pop too much, get a parse error :)
  parser->state = s_response_start;
  parser->cur_string = STR_UNKNOWN;
}


size_t imap_parser_execute(imap_parser* parser, imap_parser_settings* settings, const char* data, size_t len) {

  enum parser_state state = (enum parser_state)parser->state;
  unsigned int index = parser->index;
  enum string_ref cur_string = (enum string_ref)parser->cur_string;
  char last_char = parser->last_char;

  enum string_state str_state = (enum string_state)parser->str_state;
  unsigned int bytes_remaining = -1;
  char done;

  char c;
  const char *p, *pe;

  char* tag_start;
  const char* str;
  size_t amount;

  for (p = data, pe = data+len; p != pe; p++ ) {
    c = *p;

    switch(state) {
      case s_response_start:
        if (c == '*') state = s_response_data;
        else if(c == '+') state = s_continue_req;


        if (c == '*' || c == '+') {
          NEXT_STATE_PUSH(s_response_done);
          break;
        }

        state = s_response_done;
        // FALL THROUGH

      case s_response_done:
        if (c == '*') {
          state = s_response_fatal;
          break;
        }

        state = s_response_tagged;

        // FALL THROUGH
      case s_response_tagged:
        if (index == 0) {
          //TODO: MARK TAG START
        }
        if (c == '+' || !IS_ASTRING_CHAR(c)) {
          //TODO: TAGGED EVENT
          if (c != ' ') {
            ERR();
          }
          else {
            state = s_resp_cond_state;
          }
        }
        break;

      case s_response_fatal:
//        if (c == ' ') state = 
        

      case s_response_data:
        if(c == ' ') state = s_response_data_options;
        else ERR();
        break;
      case s_response_data_options:
        /*
        resp_cond_state // OK | NO | BAD
        resp_cond_bye   // BYE
        mailbox_data    // FLAGS | LIST | LSUB | SEARCH | STATUS | [int] | [int]
        message_data    // [nz-int]
        capability_data // CAPABILITY
        */
        switch (c) {
          case 'O':
          case 'N':
            state = s_resp_cond_state;
            break;
          case 'C':
            state = s_capability_data;
            break;
          case 'F':
          case 'L':
          case 'S':
          case '0':
            state = s_mailbox_data;
            break;
          case 'B':
            state = s_resp_state_or_bye;
            break;
          case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
            state = s_resp_mailbox_or_message_data;
            break;
          default:
            ERR();
            break;
        }

        index++;

        break;
      case s_response_data_crlf:
        if (c == '\r' && index == 0){
          index++;
        }
        if (c == '\n') {
          // CLOSED CONNECTION
        }
        break;
      case s_resp_state_or_bye:
        /*
          BAD | BYE
        */
        GIVEN(c == 'A', s_resp_cond_state);
        else GIVEN(c == 'Y', s_resp_cond_bye);
        else ERR();

        index++;

        break;

      case s_response_data_end:
        break;

      case s_resp_mailbox_or_message_data:
        break;
      case s_resp_cond_state:
        if (cur_string == STR_UNKNOWN) {
          switch(c) {
            case 'O':
              cur_string = STR_OK;
              break;
            case 'N':
              cur_string = STR_NO;
              break;
            case 'B':
              cur_string = STR_BAD;
              break;
            default:
              ERR();
              break;
          }
          index = 1;
        }
        else if (c == strings[cur_string][index]) {
          index++;
        }
        else if (c == ' ') {
          state = s_resp_text;
        }
        else {
          ERR();
        }


        break;
      case s_resp_cond_bye:
        str = strings[STR_BYE];
        if (c == ' ' && str[index] == '\0') {
          state = s_resp_text;
          index = 0;
        }
        else if (c == str[index]) {
          index++;
        }
        else {
          ERR();
        }
        break;
      case s_resp_text:
        if (c == '[') {
          state = s_resp_text_code;
          break;
        }
        else state = s_text;

        // FALL THROUGH
      case s_text:
        if (index == 0) {
          //TODO: MARK TEXT
        }
        if (!IS_TEXT_CHAR(c)) {
          if (index == 0) ERR(); // need 1 or more chars
          // TODO: END TEXT EVENT
          state = NEXT_STATE_POP();
          index = 0;
        }
        break;
      case s_resp_text_code:
        if (index == 0) {
          cur_string = STR_UNKNOWN;
          switch(c) {
            case 'A': cur_string = STR_ALERT; break;
            case 'B': cur_string = STR_BADCHARSET; break;
            case 'C':
              state = s_capability_data;
              break;
            case 'P': cur_string = STR_PARSE; break; // OR PERMANENTFLAGS
            case 'R': cur_string = STR_READ_ONLY; break; // OR READ_WRITE
            case 'T': cur_string = STR_TRYCREATE; break;
            case 'U': cur_string = STR_UIDNEXT; break; // OR UIDVALIDITY OR UNSEEN
            case '\\': state = s_resp_text_code_flag_perm; break;
          }
        }
        else if (index == 1) {
          if (IS_ATOM_CHAR(last_char)) {
            if (c == ' ') state = s_resp_text_code_atom;
            if (c == ']') state = s_resp_text_code_done;

            if (c == ' ' || c == ']') {
              // TODO: Atom event?
            }
            index = 0;
            break;
          }
          else if (cur_string == STR_PARSE && c == 'E') {
            cur_string = STR_PERMANENTFLAGS;
          }
        }
        else if (cur_string == STR_READ_ONLY && index == 5 && c == 'W') {
          cur_string = STR_READ_WRITE;
        }
        else if (cur_string == STR_UIDNEXT) {
          if (index == 3 && c == 'V') cur_string = STR_UIDVALIDITY;
          else if (index == 2 && c == 'S') cur_string = STR_UNSEEN;
        }

        str = strings[cur_string];
        if (c == ']' && str[index] == '\0') {
          state = s_resp_text_code_done;
          // TODO: EVENT
          index = 0;
        }
        else if (c == ' ' && str[index] == '\0') {
          switch(cur_string) {
            case STR_BADCHARSET:
              state = s_resp_text_code_badcharset;
              break;
            case STR_PERMANENTFLAGS:
              state = s_resp_text_code_permanentflags;
              break;
            case STR_UIDNEXT:
            case STR_UIDVALIDITY:
            case STR_UNSEEN:
              state = s_resp_text_code_u;
              break;
            default:
              ERR();
              break;
          }
          index = 0;
        }
        else if (c != str[index]) {
          ERR();
        }
        else {
          index++;
        }

        break;
      case s_resp_text_code_badcharset:
        if (c == '(') {
          state = s_resp_text_code_badcharset_str;
          done = 0;
        }
        else ERR();
        break;
      case s_resp_text_code_badcharset_str:
        if (!done) {
          ASTRING(c);
        }
        else if (c == ' ') {
          done = 0; // parse next string
        }
        else if (c == ')'){
          state = s_resp_text_code_done;
        }
        else ERR();
        break;
      case s_resp_text_code_permanentflags:

        break;
      case s_resp_text_code_flag_perm:
        break;
      case s_resp_text_code_u:
        break;
      case s_resp_text_code_atom:
        if (index == 0) {
          // MARK start
        }

        if (IS_TEXT_CHAR(c) && c != ']') {
        }
        else if (index == 0) ERR();
        else {
          // DONE
        }
        break;

      case s_resp_text_code_done:
        if (c == ' ') state = s_text;
        else ERR();
        break;

      case s_capability_data:
        break;
      case s_parse_error:
        break;



      case s_continue_req:
        break;
      case s_mailbox_data:
        break;
    }

    last_char = c;
  }

  parser->state = state;
  parser->index = index;
  parser->cur_string = cur_string;
  parser->last_char = last_char;

  return len;

parse_error:
//  parser->state = s_parse_error;
  return (p-data);
}

