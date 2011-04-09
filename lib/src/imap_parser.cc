

#include "imap_parser.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>


enum parser_state {
  s_parse_error = 1,
  s_greeting_start,
  s_greeting_sp,
  s_greeting_type_start,
  s_greeting_type,


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
  s_literal_number_start,
  s_literal_number,
  s_literal_crlf,
  s_literal_lf,
  s_literal_chars,
  s_quoted_start,
  s_quoted,
  s_quoted_escaped,

  s_nz_number_start,
  s_nz_number,
  s_permanentflags_args_start,
  s_permanentflags_args_almost_start,
  s_permanentflags_args_done,
  s_flag_perm_start,
  s_flag_perm_check,
  s_flag_perm,

  s_command_start,
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
  STR_PREAUTH,
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
  "PREAUTH",

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

#define CB_ONDATA(end, type)                                      \
if (str_start && settings->on_data) {                             \
  settings->on_data(parser, str_start, (end - str_start), type);  \
  if (type != IMAP_NONE) {                                        \
    str_start = NULL;                                             \
  }                                                               \
}

#define CB_ONDONE(type)                           \
if (settings->on_done) {                          \
  settings->on_done(parser, type);                \
}

#define SIGST(state)          \
do {                          \
  printf("State: " #state "\n");   \
} while(0);

#define STATE_CASE(st) case st: SIGST(st)

void imap_parser_init(imap_parser* parser, enum parser_types type) {
  parser->cur_string = STR_UNKNOWN;
  parser->index = 0;
  parser->last_char = '\0';
  parser->current_state = 0;

  PUSH_STATE(s_parse_error);
  switch (type) {
    case PARSER_GREETING:
      PUSH_STATE(s_greeting_start);
      break;
    case PARSER_RESPONSE:
      PUSH_STATE(s_response_start);
      break;
    case PARSER_COMMAND:
      PUSH_STATE(s_command_start);
      break;
    default:
      printf("OH GOD");
  }
}


size_t imap_parser_execute(imap_parser* parser, imap_parser_settings* settings, const char* data, size_t len) {
  
  SIGST(STARTEXEC);

  unsigned int index = parser->index;
  enum string_ref cur_string = (enum string_ref)parser->cur_string;
  char last_char = parser->last_char;

  unsigned int bytes_remaining = parser->bytes_remaining;
  enum parser_state state;

  char c;
  const char *p, *pe, *str;

  const char* str_start = NULL;

  for (p = data, pe = data+len; p != pe; p++ ) {
    state = (enum parser_state)PEEK_STATE();
    c = *p;

    switch(state) {
      STATE_CASE(s_greeting_start);
        if (c != '*') ERR();
        SET_STATE(s_greeting_sp);
        break;
      STATE_CASE(s_greeting_sp);
        if (c != ' ') ERR();
        SET_STATE(s_greeting_type_start);
        break;
      STATE_CASE(s_greeting_type_start);
        index = 0;
        switch (c) {
          case 'O': cur_string = STR_OK; break;
          case 'P': cur_string = STR_PREAUTH; break;
          case 'B': cur_string = STR_BYE; break;
          default: cur_string = STR_UNKNOWN;
        }
        str_start = p;
        SET_STATE(s_greeting_type);
        break;
      STATE_CASE(s_greeting_type);
        index++;
        str = strings[cur_string];
        if (str[index] == '\0' && c == ' ') {
          CB_ONDATA(p, IMAP_STATE);
//          PRN("STATE", str_start, p);
          SET_STATE(s_check_crlf);
          PUSH_STATE(s_resp_text);
        }
        else if (str[index] != c) {
          ERR();
        }

        break;
/*
      // Start of ( continue-req / response-data / response-tagged )
      STATE_CASE(s_response_start);
        switch (c) {
          case '+':  state = s_continue_req;  ERR(); break;
          case '*':  state = s_response_data;  ERR(); break;
          default :  state = s_response_tagged_start;  break;
        }
        p--;
        break;

      // Start of ( tag SP resp-code-state CRLF )
      STATE_CASE(s_response_tagged_start);

      // Start of ( 1*<STRING-CHAR except "+"> )
      STATE_CASE(s_tag_start);
        index = 0;
        state = s_tag;
        str_start = p;
        // fall through
      STATE_CASE(s_tag);
        if (IS_ASTRING_CHAR(c) && c != '+') {
          index++;
        }
        else {
          if (index == 0) ERR();
          else {
//            PRN("TAG", str_start, p);
            CB_ONDATA(p, IMAP_TAG);
            state = s_response_tagged_mid;
            p--;
          }
        }
        break;

      STATE_CASE(s_response_tagged_mid);
        index = 0;
        if (c != ' ') ERR();
        state = s_resp_cond_state;
        next_state = s_check_crlf;
        break;

      // Start of ("OK" / "NO" / "BAD") SP resp-text
      STATE_CASE(s_resp_cond_state);
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
//            PRN("TYPE", str_start, p);
            CB_ONDATA(p, IMAP_STATE);
            break;
          }
          else if (str[index] != c) {
            ERR();
          }
        }
        index++;
        break;
*/
      // Start of ["[" resp-text-code "]" SP] text
      STATE_CASE(s_resp_text);
        if (c == '[') {
          SET_STATE(s_resp_text_code_start);
          break;
        }
        // Fall through
      STATE_CASE(s_text_start);
        if (!IS_TEXT_CHAR(c)) ERR();
        str_start = p;
        SET_STATE(s_text);
        break;
      STATE_CASE(s_text);
        if (!IS_TEXT_CHAR(c)) {
          PRN("TEXT", str_start, p);
          CB_ONDATA(p, IMAP_TEXT);

          p--;
          POP_STATE();
        }
        break;

      /**
       * Start of ("ALERT" / "BADCHARSET" [SP "(" astring *(SP astring) ")"] / capability-data / "PARSE" /
       *           "PERMANENTFLAGS" SP "(" [flag-perm *(flag-perm)] ")" / "READ-ONLY" / "READ-WRITE" / "TRYCREATE" /
       *           "UIDNEXT" SP nz-number / "UIDVALIDITY" SP nz-number /
       *           "UNSEEN" SP nz-number / atom [SP 1*<any TEXT-CHAR except "]"]
       */
      STATE_CASE(s_resp_text_code_start);
        index = 0;
        SET_STATE(s_resp_text_code);
        // Fall through
      STATE_CASE(s_resp_text_code);
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
                  SET_STATE(s_resp_text_code_badcharset_args_start);
                  break;
                }
              case STR_ALERT:
              case STR_READ_ONLY:
              case STR_READ_WRITE:
              case STR_PARSE:
              case STR_TRYCREATE:
                if (c == ' ') ERR();
                SET_STATE(s_text_start);
//                PRN("TEXTCODE", str_start, p);
                CB_ONDATA(p, IMAP_TEXTCODE);
                break;
              case STR_UIDNEXT:
              case STR_UIDVALIDITY:
              case STR_UNSEEN:
                if (c == ']') ERR();
                SET_STATE(s_nz_number_start);
//                PRN("TEXTCODE", str_start, p);
                CB_ONDATA(p, IMAP_TEXTCODE);
                break;
              case STR_PERMANENTFLAGS:
                if (c != ' ') ERR();
                SET_STATE(s_permanentflags_args_start);
                break;
              case STR_CAPABILITY:
                SET_STATE(s_capability_data_arg_start);
                break;
              default:
                SET_STATE(s_resp_text_code_atom_test);
                break;
            }
          }
          else if (str[index] != c) {
            SET_STATE(s_resp_text_code_atom_test);
          }

          index++;
        }
        break;

      STATE_CASE(s_resp_text_code_almost_done);
        if (c != ']') ERR();
        SET_STATE(s_resp_text_code_done);
        break;
      STATE_CASE(s_resp_text_code_done);
        if (c != ' ') ERR();
        SET_STATE(s_text_start);
        break;

      // Parse badcharset args: "(" astring *(SP astring) ")"
      STATE_CASE(s_resp_text_code_badcharset_args_start);
        if (c != '(') ERR();
        SET_STATE(s_astring_start);
        break;
      STATE_CASE(s_resp_text_code_badcharset_args_done);
        if (c == ' ') {
          SET_STATE(s_astring_start);
        }
        else {
          if (c != ')') ERR();
          SET_STATE(s_resp_text_code_almost_done);
        }
        break;

      // Parse capability args *(SP atom)
      STATE_CASE(s_capability_data_start);
        if (c != ' ') {
          SET_STATE(s_resp_text_code_done); // TODO: this needs to be different for untagged
        }
        else {
          SET_STATE(s_capability_data_arg_start);
        }
        break;
      STATE_CASE(s_capability_data_arg_start);
        str_start = p;
        index = 0;
        if (!IS_ATOM_CHAR(c)) {
          ERR();
        }
        SET_STATE(s_capability_data_arg);
        break;
      STATE_CASE(s_capability_data_arg);
        if (!IS_ATOM_CHAR(c)) {
          SET_STATE(s_capability_data_start);
//          PRN("CAP", str_start, p);
          CB_ONDATA(p, IMAP_CAPABILITY);
          p--;
        }
        break;

      STATE_CASE(s_permanentflags_args_start);
        if (c != '(') ERR();
        SET_STATE(s_permanentflags_args_almost_start);
        break;
      STATE_CASE(s_permanentflags_args_almost_start);
        if (c != ')') {
          SET_STATE(s_flag_perm_start);
          p--;
          break;
        }
        // Fall Through
      STATE_CASE(s_permanentflags_args_done);
        if (c == ' ') {
          SET_STATE(s_flag_perm_start);
        }
        else {
          if (c != ')') ERR();
          SET_STATE(s_resp_text_code_almost_done);
        }
        break;

      STATE_CASE(s_flag_perm_start);
        if (!IS_ATOM_CHAR(c) && c != '\\') ERR();
        SET_STATE(s_flag_perm_check);
        str_start = p;
        break;
      STATE_CASE(s_flag_perm_check);
        if (c == '*') {
          SET_STATE(s_permanentflags_args_done);
//          PRN("PERM", str_start, p+1);
          CB_ONDATA(p+1, IMAP_FLAG);
        }
        else if (IS_ATOM_CHAR(c)) {
          SET_STATE(s_flag_perm);
        }
        else if (last_char != '\\') {
          // accounts for flags that are a single atom-char
          SET_STATE(s_permanentflags_args_done);
//          PRN("PERM", str_start, p);
          CB_ONDATA(p, IMAP_FLAG);
          p--;
        }
        else ERR();
        break;
      STATE_CASE(s_flag_perm);
        if (!IS_ATOM_CHAR(c)) {
          SET_STATE(s_permanentflags_args_done);
//          PRN("PERM", str_start, p);
          CB_ONDATA(p, IMAP_FLAG);
          p--;
        }
        break;
        


      STATE_CASE(s_resp_text_code_atom_test);

      STATE_CASE(s_resp_text_code_atom);
        break;



      STATE_CASE(s_astring_start);
        switch (c) {
          case '{': SET_STATE(s_literal_start); break;
          case '"': SET_STATE(s_quoted_start); break;
          default:
            if (!IS_ASTRING_CHAR(c)) ERR();
            SET_STATE(s_astring);
            str_start = p;
            break;
        }
        p--;
        break;

      STATE_CASE(s_astring);
        if (!IS_ASTRING_CHAR(c)) {
//          PRN("ASTRING", str_start, p);
          CB_ONDATA(p, IMAP_ASTRING);
          SET_STATE(s_resp_text_code_badcharset_args_done);
          p--;
        }
        break;

      STATE_CASE(s_nz_number_start);
        if (c < '0' || c > '9') ERR();
        SET_STATE(s_nz_number);
        str_start = p;
        break;
      STATE_CASE(s_nz_number);
        if (!IS_DIGIT(c)) {
          SET_STATE(s_resp_text_code_almost_done);
//          PRN("NZNUM", str_start, p);
          CB_ONDATA(p, IMAP_NUMBER);
          p--;
          break;
        }
        break;


      STATE_CASE(s_literal_start);
        if (c != '{') ERR();
        SET_STATE(s_literal_number_start);
        break;
      STATE_CASE(s_literal_number_start);
        if (!IS_DIGIT(c)) ERR();
        SET_STATE(s_literal_number);
        index = c - '0';
        break;
      STATE_CASE(s_literal_number);
        if (!IS_DIGIT(c)) {
          if (c != '}') ERR();
          SET_STATE(s_literal_crlf);
          bytes_remaining = index;
        }
        else {
          index *= 10;
          index += c - '0';
        }
        break;
      STATE_CASE(s_literal_crlf);
        if (c == '\r') {
          SET_STATE(s_literal_lf);
          break;
        }
      STATE_CASE(s_literal_lf);
        if (c == '\n') {
          SET_STATE(s_literal_chars);
        }
        else {
          ERR();
        }
        break;
      STATE_CASE(s_literal_chars);
        index = (bytes_remaining < (pe-p))?bytes_remaining:(pe-p);
//        PRN("LITERAL", p, p+index);
        str_start = p;
        CB_ONDATA(p+index, IMAP_LITERAL);
        p += index-1;
        SET_STATE(s_resp_text_code_badcharset_args_done);
        break;


      STATE_CASE(s_quoted_start);
        if (!IS_DQUOTE(c)) ERR();
        SET_STATE(s_quoted);
        str_start = p+1; //TODO:  WRONG
        break;
      STATE_CASE(s_quoted);
        if (c == '\\') {
          SET_STATE(s_quoted_escaped);
        }
        else if (!(IS_TEXT_CHAR(c) && !IS_QUOTED_SPECIAL(c))) {
          if (!IS_DQUOTE(c)) ERR();
//          PRN("QUOTED", str_start, p);
          CB_ONDATA(p, IMAP_QUOTED);
          SET_STATE(s_resp_text_code_badcharset_args_done);
        }
        break;

      STATE_CASE(s_quoted_escaped);
        if (!IS_QUOTED_SPECIAL(c)) ERR();
        SET_STATE(s_quoted);
        break;

      STATE_CASE(s_check_crlf);
        if (c == '\r') {
          SET_STATE(s_check_lf);
          break;
        }
      STATE_CASE(s_check_lf);
        if (c == '\n') {
          POP_STATE();
          CB_ONDONE(IMAP_RESPONSE);
        }
        else {
          ERR();
        }
        break;
    }

    last_char = c;
  }

  if (str_start) {
    CB_ONDATA(p, IMAP_NONE); // If data is split across multiple buffers
  }

  parser->index = index;
  parser->cur_string = cur_string;
  parser->last_char = last_char;
  parser->bytes_remaining = bytes_remaining;

  return len;

parse_error:

  parser->index = index;
  parser->cur_string = cur_string;
  parser->last_char = last_char;

  return (p-data);
}

