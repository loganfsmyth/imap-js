

#include "imap_parser.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>


enum parser_state {
  s_parse_error = 1,
  s_greeting_start,
  s_greeting_type_start,
  s_greeting_type,
  s_response_start,
  s_continue_req,
  s_continue_resp_or_base64,
  s_text_or_base64_start,
  s_text_or_base64,
  s_mailbox_list_start,
  s_optional_nznum,
  s_mailbox,
  s_mailbox_list_flags,
  s_mbx_list_flag_start,
  s_mbx_list_flag,
  s_mailbox_list_str,
  s_nil_start,
  s_nil,
  s_response_data_type_start,
  s_response_data_type,
  s_response_data_type_numbered_start,
  s_response_data_type_numbered,
  s_msg_att_start,
  s_msg_att,
  s_msg_att_two,
  s_msg_att_done,
  s_envelope_start,
  s_envelope,
  s_datetime_start,
  s_datetime,
  s_nstring,
  s_body,
  s_uniqueid,
  s_closeparen,

  s_addr_nil_start,
  s_addr_list_start,
  s_addr_list_done,
  s_address,

  s_body_mpart_start,
  s_body_mpart_next,
  s_body_mpart_done,
  s_body_ext_mpart,
  s_body_fld_dsp_start,
  s_body_fld_dsp,
  s_body_fld_lang,
  s_body_fld_lang_done,
  s_body_fld_loc,
  s_body_extension,
  s_body_extension_done,

  s_body_ext_mpart_opt_fld_dsp,
  s_body_ext_mpart_opt_fld_lang,
  s_body_ext_mpart_opt_fld_loc,
  s_body_ext_mpart_opt_body_ext,

  s_body_start,
  s_body_fields,
  s_body_1part_start,
  s_body_1part_type,
  s_body_1part_rfc822_message_start,
  s_body_1part_rfc822_message,
  s_body_1part_message_text_or_string,
  s_body_fld_lines,
  s_body_fld_param_start,
  s_body_fld_param,
  s_body_fld_param_done,

  s_section_start,
  s_section,
  s_section_done,
  s_section_part,
  s_section_msgtext_start,
  s_section_msgtext,
  s_section_text_start,
  s_section_text,
  s_opt_section_text,
  s_body_section_num,
  s_body_section_num_done,
  s_section_part_start,
  s_section_part_text_or_num,

  s_header_list_start,
  s_header_list_done,
  s_header_fld_name,

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
  s_final_crlf,
  s_final_lf,
  s_resp_text,
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

  s_mailbox_status_att_list_start,
  s_mailbox_status_att_list_opt,
  s_sp,
  s_mailbox_status_att_start,
  s_mailbox_status_att,

  s_astring_start,
  s_astring,
  s_string,
  s_literal_start,
  s_literal_number_start,
  s_literal_number,
  s_literal_chars,
  s_quoted_start,
  s_quoted,
  s_quoted_escaped,

  s_number_start,
  s_number,
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
  STR_FLAGS,
  STR_LIST,
  STR_SEARCH,
  STR_LSUB,
  STR_STATUS,
  STR_MESSAGES,
  STR_RECENT,
  STR_EXISTS,
  STR_FETCH,
  STR_EXPUNGE,
  STR_ENVELOPE,
  STR_INTERNALDATE,
  STR_RFC822,
  STR_RFC822_HEADER,
  STR_RFC822_TEXT,
  STR_RFC822_SIZE,
  STR_UID,
  STR_BODY,
  STR_BODYSTRUCTURE,
  STR_MESSAGE,
  STR_TEXT,
  STR_HEADER,
  STR_HEADER_FIELDS,
  STR_HEADER_FIELDS_NOT,
  STR_MIME,
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
  "FLAGS",
  "LIST",
  "SEARCH",
  "LSUB",
  "STATUS",
  "MESSAGES",
  "RECENT",
  "EXISTS",
  "FETCH",
  "EXPUNGE",
  "ENVELOPE",
  "INTERNALDATE",
  "RFC822",
  "RFC822.HEADER",
  "RFC822.TEXT",
  "RFC822.SIZE",
  "UID",
  "BODY",
  "BODYSTRUCTURE",
  "MESSAGE",
  "TEXT",
  "HEADER",
  "HEADER.FIELDS",
  "HEADER.FIELDS.NOT",
  "MIME",
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

#define SIGST(state) printf("State: %c - %d: " #state "\n", c, index)

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
      break;
  }
}


size_t imap_parser_execute(imap_parser* parser, imap_parser_settings* settings, const char* data, size_t len) {
  
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
      /**
       * FUNCTION parse_error
       */
      STATE_CASE(s_parse_error);
        ERR();
        break;


      /**
       * ENTRY command
       */
      STATE_CASE(s_command_start);
        // TODO
        break;


      /**
       * ENTRY greeting
       * FORMAT "*" SP (resp-cond-auth / resp-cond-bye) CRLF
       */
      STATE_CASE(s_greeting_start);
        if (c != '*') ERR();
        SET_STATE(s_greeting_type_start);
        PUSH_STATE(s_sp);
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
          SET_STATE(s_final_crlf);
          PUSH_STATE(s_resp_text);
        }
        else if (str[index] != c) {
          ERR();
        }

        break;


      /**
       * ENTRY response
       * FORMAT ( continue-req / response-data / response-tagged )
       */
      STATE_CASE(s_response_start);
        SET_STATE(s_final_crlf);
        switch (c) {
          case '+':  PUSH_STATE(s_continue_req); break;
          case '*':  PUSH_STATE(s_response_data); break;
          default :  PUSH_STATE(s_response_tagged_start);  break;
        }
        p--;
        break;

      STATE_CASE(s_continue_req);
        if (c != '+') ERR();
        SET_STATE(s_continue_resp_or_base64);
        PUSH_STATE(s_sp);
        break;
      STATE_CASE(s_continue_resp_or_base64);
        if (c == '[') {
          SET_STATE(s_resp_text);
          p--;
          break;
        }
        // Fall through
      STATE_CASE(s_text_or_base64_start);
        str_start = p;
        SET_STATE(s_text_or_base64);
        index = 0;
      STATE_CASE(s_text_or_base64);
        if (!IS_TEXT_CHAR(c)) {
          if (index == 0) ERR();
          if (index%4 == 0) {
            CB_ONDATA(p, IMAP_TEXT_OR_BASE64);
          }
          else {
            CB_ONDATA(p, IMAP_TEXT);
          }
          p--;
          POP_STATE();
          break;
        }
        if (!IS_ALPHA(c) && !IS_DIGIT(c) && c != '+' && c != '/' && c != '=') {
          SET_STATE(s_text);
        }
        index++;
        break;




      STATE_CASE(s_response_data);
        if (c != '*') ERR();
        SET_STATE(s_response_data_type_start);
        PUSH_STATE(s_sp);
        break;
      STATE_CASE(s_response_data_type_start);
        index = 0;
        str_start = p;
        SET_STATE(s_response_data_type);
      STATE_CASE(s_response_data_type);
        /**
         *  ("OK" / "NO" / "BAD") SP resp-text
         *  "BYE" SP resp-text
         *  "CAPABILITY" *(SP capability) SP "IMAP4rev1" *(SP capability)
         * mailbox-data
         *  "FLAGS" SP flag-list
         *  "LIST" SP mailbox-list
         *  "LSUB" SP mailbox-list
         *  "SEARCH" *(SP nz-number)
         *  "STATUS" SP mailbox SP "(" [status-att-list] ")"
         *  number SP ("EXISTS" / "RECENT")
         * message-data
         *  nz-number SP ("EXPUNGE" / ("FETCH" SP msg-att))
         */
        if (index == 0) {
          switch (c) {
            case 'O':
              cur_string = STR_OK;
              break;
            case 'N':
              cur_string = STR_NO;
              break;
            case 'B':
              cur_string = STR_BAD;
              break;
            case 'C':
              cur_string = STR_CAPABILITY;
              break;
            case 'F':
              cur_string = STR_FLAGS;
              break;
            case 'L':
              cur_string = STR_LIST;
              break;
            case 'S':
              cur_string = STR_SEARCH;
              break;
            default:
              if (!IS_DIGIT(c)) ERR();
              p--;
              SET_STATE(s_response_data_type_numbered_start);
              PUSH_STATE(s_sp);
              PUSH_STATE(s_number);
              cur_string = STR_UNKNOWN;
              break;
          }
        }
        else if (index == 1) {
          switch (c) {
            case 'Y':
              if (cur_string == STR_BAD) {
                cur_string = STR_BYE;
              }
              break;
            case 'S':
              if (cur_string == STR_LIST) {
                cur_string = STR_LSUB;
              }
              break;
            case 'T':
              if (cur_string == STR_SEARCH) {
                cur_string = STR_STATUS;
              }
              break;
            default:
              break;
          }
        }

        str = strings[cur_string];
        if (cur_string == STR_UNKNOWN) {
          // changing state to numbered
        }
        else if (str[index] == '\0' && c == ' ') {
          switch (cur_string) {
            case STR_OK:
            case STR_NO:
            case STR_BAD:
            case STR_BYE:
              SET_STATE(s_resp_text);
              break;
            case STR_CAPABILITY:
              SET_STATE(s_capability_data_arg_start);
              break;
            case STR_FLAGS:
               // TODO Remember to filter out '\*' from list of these flags
              SET_STATE(s_permanentflags_args_start);
              break;
            case STR_LIST:
            case STR_LSUB:
               SET_STATE(s_mailbox_list_start);
              break;
            case STR_SEARCH:
              SET_STATE(s_optional_nznum);
              p--;
              break;
            case STR_STATUS:
               // check for ( mailbox sp mailbox_status_att_list )
              SET_STATE(s_mailbox_status_att_list_start);
              PUSH_STATE(s_sp);
              PUSH_STATE(s_mailbox);
              break;
            default:
              ERR();
              break;
          }
        }
        else if (str[index] != c) {
          ERR();
        }

        index++;
        break;

      STATE_CASE(s_response_data_type_numbered_start);
        index = 0;
        str_start = p;
        SET_STATE(s_response_data_type_numbered);
      STATE_CASE(s_response_data_type_numbered);
        if (index == 0) {
          switch (c) {
            case 'R':
              cur_string = STR_RECENT;
              break;
            case 'E':
              cur_string = STR_EXISTS;
              break;
            case 'F':
              cur_string = STR_FETCH;
              break;
          }
        }
        else if (index == 2 && cur_string == STR_EXISTS && c == 'P') {
          cur_string = STR_EXPUNGE;
        }

        str = strings[cur_string];
        if (str[index] == '\0') {
          if (cur_string == STR_FETCH) {
            if (c != ' ') ERR();
            SET_STATE(s_msg_att_start);
            CB_ONDATA(p, IMAP_NUMBERED_STR);
          }
          else {
            CB_ONDATA(p, IMAP_NUMBERED_STR);
            p--;
            POP_STATE();
          }
        }
        else if (str[index] != c) {
          ERR();
        }

        index++;
        break;



      /**
       * FUNCTION msg_att
       *  "(" 1*(
       *  "FLAGS" SP "(" [flag-fetch *(SP flag-fetch)] ")"  /
       *  "ENVELOPE" SP envelope  /
       *  "INTERNALDATE" SP date-time /
       *  "RFC822" [".HEADER" / ".TEXT"] SP nstring /
       *  "RFC822.SIZE" SP number  /
       *  "BODY" ["STRUCTURE"] SP body  /
       *  "BODY" section ["<" number ">"] SP nstring  /
       *  "UID" SP uniqueid
       *  ) ")"
       */
      STATE_CASE(s_msg_att_start);
        if (c != '(') ERR();
        SET_STATE(s_msg_att);
        break;
      STATE_CASE(s_msg_att);
        index = 0;
        cur_string = STR_UNKNOWN;
        SET_STATE(s_msg_att_done);
        PUSH_STATE(s_msg_att_two);
      STATE_CASE(s_msg_att_two);
        if (index == 0) {
          switch (c) {
            case 'F':
              cur_string = STR_FLAGS;
              break;
            case 'E':
              cur_string = STR_ENVELOPE;
              break;
            case 'I':
              cur_string = STR_INTERNALDATE;
              break;
            case 'R':
              cur_string = STR_RFC822;
              break;
            case 'B':
              cur_string = STR_BODY;
              break;
            case 'U':
              cur_string = STR_UID;
              break;
            default:
              break;
          }
        }
        else if (index == 4 && cur_string == STR_BODY && c == 'S') {
          cur_string = STR_BODYSTRUCTURE;
        }
        else if (index == 6 && cur_string == STR_RFC822 && c == '.') {
          cur_string = STR_RFC822_HEADER;
        }
        else if (index == 7 && cur_string == STR_RFC822_HEADER) {
          if (c == 'T') {
            cur_string = STR_RFC822_TEXT;
          }
          else if (c == 'S') {
            cur_string = STR_RFC822_SIZE;
          }
        }

        str = strings[cur_string];
        if (str[index] == '\0' && (c == ' ' || (cur_string == STR_BODY && c == '['))) {
          switch (cur_string) {
            case STR_FLAGS:
              SET_STATE(s_permanentflags_args_start);
              break;
            case STR_ENVELOPE:
              SET_STATE(s_envelope_start);
              break;
            case STR_INTERNALDATE:
              SET_STATE(s_datetime_start);
              break;
            case STR_RFC822:
            case STR_RFC822_HEADER:
            case STR_RFC822_TEXT:
              SET_STATE(s_nstring);
              break;
            case STR_RFC822_SIZE:
              SET_STATE(s_number_start);
              break;
            case STR_BODY:
              if (c == '[') {
                SET_STATE(s_nstring);
                PUSH_STATE(s_sp);
                PUSH_STATE(s_body_section_num);
                PUSH_STATE(s_section_start);
                p--;
                break;
              }
            case STR_BODYSTRUCTURE:
              SET_STATE(s_body_start);
              break;

            case STR_UID:
              SET_STATE(s_uniqueid);
              break;
            default:
              ERR();
              break;
          }
        }
        else if (str[index] != c) {
          ERR();
        }

        index++;
        break;
      STATE_CASE(s_msg_att_done);
        if (c == ' ') {
          SET_STATE(s_msg_att);
        }
        else if (c == ')') {
          POP_STATE();
        }
        else {
          ERR();
        }
        break;


      /**
       * FUNCTION body_section_num
       * FORMAT   [ "<" number ">" ]
       */
      STATE_CASE(s_body_section_num);
        if (c != '<') ERR();
        SET_STATE(s_body_section_num_done);
        PUSH_STATE(s_number_start);
        break;
      STATE_CASE(s_body_section_num_done);
        if (c != '>') ERR();
        POP_STATE();
        break;


      /**
       * FUNCTION section
       * FORMAT   "[" [section-msgtext / ( section-part opt-section-text )] "]"
       */
      STATE_CASE(s_section_start);
        if (c != '[') ERR();
        SET_STATE(s_section);
        break;
      STATE_CASE(s_section);
        if (c == ']') {
          POP_STATE();
        }
        else if (c >= '1' && c <= '9') {
          SET_STATE(s_section_done);
          PUSH_STATE(s_opt_section_text);
          PUSH_STATE(s_section_part_start);
          p--;
        }
        else {
          SET_STATE(s_section_done);
          PUSH_STATE(s_section_msgtext_start);
          p--;
        }

        break;
      STATE_CASE(s_section_done);
        if (c != ']') ERR();
        POP_STATE();
        break;


      /**
       * FUNCTION opt-section-text
       * FORMAT   [ "." section-text ]
       */
      STATE_CASE(s_opt_section_text);
        if (c != '.') {
          p--;
          POP_STATE();
        }
        else {
          SET_STATE(s_section_text);
        }
        break;


      /**
       * FUNCTION section-part
       * FORMAT   nz-number *("." nz-number) ["." section-text]
       */
      STATE_CASE(s_section_part_start);
        p--;
        SET_STATE(s_section_part);
        PUSH_STATE(s_nz_number_start);
        break;
      STATE_CASE(s_section_part);
        if (c != '.') {
          p--;
          POP_STATE();
        }
        else {
          SET_STATE(s_section_part_text_or_num);
        }
        break;
      STATE_CASE(s_section_part_text_or_num);
        if (c >= '1' && c <= '9') {
          SET_STATE(s_section_part);
          PUSH_STATE(s_nz_number_start);
        }
        else {
          SET_STATE(s_section_text_start);
        }
        p--;
        break;


      /**
       * FUNCTION section-text
       * FORMAT   section-msgtext / "MIME"
       */
      STATE_CASE(s_section_text_start);
        index = 0;
        cur_string = STR_MIME;
        SET_STATE(s_section_text);
      STATE_CASE(s_section_text);
        str = strings[cur_string];
        if (index == 0 && c != 'M') {
          p--;
          SET_STATE(s_section_msgtext_start);
        }
        else if (str[index] == '\0') {
          p--;
          POP_STATE();
        }
        else if (str[index] != c) {
          ERR();
        }
        index++;
        break;


      /**
       * FUNCTION section-msgtext
       * FORMAT "HEADER" / ( "HEADER.FIELDS" [ ".NOT" ] SP header-list) / "TEXT" /  
       */
      STATE_CASE(s_section_msgtext_start);
        index = 0;
        str_start = p;
        SET_STATE(s_section_msgtext);
      STATE_CASE(s_section_msgtext);
        if (index == 0) {
          switch (c) {
            case 'H':
              cur_string = STR_HEADER;
              break;
            case 'T':
              cur_string = STR_TEXT;
              break;
            default:
              ERR();
              break;
          }
        }
        str = strings[cur_string];
        if (str[index] == '\0') {
          if (c == '.' && cur_string == STR_HEADER) {
            cur_string = STR_HEADER_FIELDS;
          }
          else if (c == '.' && cur_string == STR_HEADER_FIELDS) {
            cur_string = STR_HEADER_FIELDS_NOT;
          }
          else {
            switch (cur_string) {
              case STR_HEADER_FIELDS:
              case STR_HEADER_FIELDS_NOT:
                if (c == ' ') {
                  SET_STATE(s_header_list_start);
                }
                else ERR();
                break;
              case STR_HEADER:
              case STR_TEXT:
                POP_STATE();
                p--;
                break;
              default:
                ERR();
                break;
            }
          }
        }
        else if (str[index] != c) {
          ERR();
        }
        index++;
        break;


      /**
       * FUNCTION header-list
       * FORMAT   "(" header-fld-name *(SP header-fld-name) ")"
       */
      STATE_CASE(s_header_list_start);
        if (c != '(') ERR();
        SET_STATE(s_header_list_done);
        PUSH_STATE(s_header_fld_name);
        break;
      STATE_CASE(s_header_list_done);
        if (c == ')') {
          POP_STATE();
        }
        else if (c == ' ') {
          SET_STATE(s_header_list_done);
          PUSH_STATE(s_header_fld_name);
        }
        else {
          ERR();
        }
        break;


      /**
       * FUNCTION header-fld-name
       * FORMAT   astring
       */
      STATE_CASE(s_header_fld_name);
        p--;
        SET_STATE(s_astring_start);
        break;


      /**
       * FUNCTION optional_nznum
       * FORMAT   *(SP nz-number)
       *   Used in mailbox-data
       */
      STATE_CASE(s_optional_nznum);
        if (c == '\r' || c == '\n') {
          POP_STATE();
          p--;
        }
        else if (c == ' ') {
          SET_STATE(s_optional_nznum);
          PUSH_STATE(s_nz_number_start);
        }
        else {
          ERR();
        }
        break;



      /**
       * FUNCTION envelope
       * FORMAT   "(" nstring SP env-subject SP env-from SP env-sender SP env-reply-to SP env-to SP env-cc SP env-bcc SP nstring SP nstring ")"
       */
      STATE_CASE(s_envelope_start);
        if (c != '(') ERR();
        SET_STATE(s_envelope);
        break;
      STATE_CASE(s_envelope);
        SET_STATE(s_closeparen);
        PUSH_STATE(s_nstring);  // env-message-id
        PUSH_STATE(s_sp);
        PUSH_STATE(s_nstring);  // env-in-reply-to
        PUSH_STATE(s_sp);
        PUSH_STATE(s_addr_nil_start); // env-bcc
        PUSH_STATE(s_sp);
        PUSH_STATE(s_addr_nil_start); // env-cc
        PUSH_STATE(s_sp);
        PUSH_STATE(s_addr_nil_start); // env-to
        PUSH_STATE(s_sp);
        PUSH_STATE(s_addr_nil_start); // env-reply-to
        PUSH_STATE(s_sp);
        PUSH_STATE(s_addr_nil_start); // end-sender
        PUSH_STATE(s_sp);
        PUSH_STATE(s_addr_nil_start); // env-from
        PUSH_STATE(s_sp);
        PUSH_STATE(s_nstring);  // env-subject
        PUSH_STATE(s_sp);
        PUSH_STATE(s_nstring);  // env-date
        p--;
        break;


      /**
       * FUNCTION addr_nil
       * FORMAT   "(" 1*address ")" / nil
       */
      STATE_CASE(s_addr_nil_start);
        if (c != '(') {
          SET_STATE(s_nil_start);
          p--;
        }
        else {
          SET_STATE(s_closeparen);
          PUSH_STATE(s_addr_list_start);
        }

        break;

      /**
       * FUNCTION addr_list
       * FORMAT 1*address
       */
      STATE_CASE(s_addr_list_start);
        SET_STATE(s_addr_list_done);
        PUSH_STATE(s_address);
        p--;
        break;
      STATE_CASE(s_addr_list_done);
        if (c == ')') {
          POP_STATE();
        }
        else {
          SET_STATE(s_address);
        }
        p--;
        break;

      /**
       * FUNCTION address
       * FORMAT "(" addr-name SP addr-adl SP addr-mailbox SP addr-host ")"
       */
      STATE_CASE(s_address);
        if (c != '(') ERR();
        SET_STATE(s_closeparen);
        PUSH_STATE(s_nstring);  // addr-host
        PUSH_STATE(s_sp);
        PUSH_STATE(s_nstring);  // addr-mailbox
        PUSH_STATE(s_sp);
        PUSH_STATE(s_nstring);  // addr-adl
        PUSH_STATE(s_sp);
        PUSH_STATE(s_nstring);  // addr-name
        break;





      /**
       * FUNCTION body
       * FORMAT   "(" (body-type-1part / body-type-mpart) ")"
       */
      STATE_CASE(s_body_start);
        if (c != '(') ERR();
        SET_STATE(s_closeparen);
        PUSH_STATE(s_body);
        break;
      STATE_CASE(s_body);
        if (c == '(') {
          SET_STATE(s_body_mpart_start);
        }
        else {
          SET_STATE(s_body_1part_start);
        }
        p--;
        break;




      /**
       * FUNCTION body_1part
       * (
       *  ((""" ("APPLICATION" / "AUDIO" / "IMAGE" / "MESSAGE" / "VIDEO") """) / string) SP string SP body-fields
       *  """ "MESSAGE" """ SP """ "RFC822" """ SP body-fields SP envelope SP body SP body-fld-lines
       *  """ "TEXT" """ SP string SP body-fields SP body-fld-lines
       * ) 
       * [SP body-ext-1part] // TODO
       */
      STATE_CASE(s_body_1part_start);
        if (c == '{') {
          SET_STATE(s_body_fields);
          PUSH_STATE(s_sp);
          PUSH_STATE(s_string);
          PUSH_STATE(s_sp);
          PUSH_STATE(s_literal_start);
          p--;
        }
        else if (c == '"') {
          str_start = p+1; // TODO: Wrong?
          index = 0;
          cur_string = STR_UNKNOWN;
          SET_STATE(s_body_1part_message_text_or_string);
        }
        else {
          ERR();
        }
        break;

      // Pick up 'TEXT', 'MESSAGE', or drop back to standard quoted string
      STATE_CASE(s_body_1part_message_text_or_string);
        if (c == 'M') {
          cur_string = STR_MESSAGE;
        }
        else if (c == 'T') {
          cur_string = STR_TEXT;
        }
        SET_STATE(s_body_1part_type);
        // Fall through
      STATE_CASE(s_body_1part_type);
        str = strings[cur_string];
        if (str[index] == '\0' && c == '"' && cur_string != STR_UNKNOWN) {
          switch (cur_string) {
            case STR_MESSAGE:
              SET_STATE(s_body_1part_rfc822_message_start);
              PUSH_STATE(s_sp);
              break;
            case STR_TEXT:
              SET_STATE(s_body_fld_lines);
              PUSH_STATE(s_sp);
              PUSH_STATE(s_body_fields);
              PUSH_STATE(s_sp);
              PUSH_STATE(s_string);
              PUSH_STATE(s_sp);
              break;
            default:
              ERR();
              break;
          }
        }
        else if (str[index] != c) {
          SET_STATE(s_body_fields);
          PUSH_STATE(s_sp);
          PUSH_STATE(s_string);
          PUSH_STATE(s_sp);
          PUSH_STATE(s_quoted);
          p--;
        }
        index++;
        break;

      // Choose between 'RFC822' , quoted, or literal
      // Choose between media-message and media-basic
      STATE_CASE(s_body_1part_rfc822_message_start);
        if (c != '"') {
          if (c == '{') {
            p--;
            SET_STATE(s_body_fields);
            PUSH_STATE(s_sp);
            PUSH_STATE(s_string);
            PUSH_STATE(s_sp);
            PUSH_STATE(s_literal_start);
          }
          else ERR();
        }
        index = 0;
        str_start = p + 1; // TODO right?
        SET_STATE(s_body_1part_rfc822_message);
        break;
      STATE_CASE(s_body_1part_rfc822_message);
        str = strings[STR_RFC822];
        if (str[index] == '\0' && c == '"') {
          SET_STATE(s_body_fld_lines);
          PUSH_STATE(s_sp);
          PUSH_STATE(s_body_start);
          PUSH_STATE(s_sp);
          PUSH_STATE(s_envelope_start);
          PUSH_STATE(s_sp);
          PUSH_STATE(s_body_fields);
          PUSH_STATE(s_sp);
        }
        else if (str[index] != c) {
          p--;
          SET_STATE(s_body_fields);
          PUSH_STATE(s_sp);
          PUSH_STATE(s_quoted);
        }
        index++;
        break;


      /**
       * FUNCTION body-mpart
       * FORMAT   1*body SP media-subtype [SP body-ext-mpart]
       */
      STATE_CASE(s_body_mpart_start);
        SET_STATE(s_body_mpart_next);
        PUSH_STATE(s_body_start);
        p--;
        break;
      STATE_CASE(s_body_mpart_next);
        if (c == '(') {
          SET_STATE(s_body_mpart_next);
          PUSH_STATE(s_body_start);
          p--;
        }
        else if (c == ' ') {
          SET_STATE(s_body_mpart_done);
          PUSH_STATE(s_string);
        }
        else {
          ERR();
        }
        break;
      STATE_CASE(s_body_mpart_done);
        if (c != ' ') {
          p--;
          POP_STATE();
        }
        else {
          SET_STATE(s_body_ext_mpart);
        }
        break;


      /**
       * FUNCTION body-ext-mpart
       * FORMAT   body-fld-param [SP body-fld-dsp [SP body-fld-lang [SP body-fld-loc *(SP body-extension)]]]
       */
      STATE_CASE(s_body_ext_mpart);
        p--;
        SET_STATE(s_body_ext_mpart_opt_fld_dsp);
        PUSH_STATE(s_body_fld_param_start);
        break;
      STATE_CASE(s_body_ext_mpart_opt_fld_dsp);
        if (c != ' ') {
          p--;
          POP_STATE();
        }
        else {
          SET_STATE(s_body_ext_mpart_opt_fld_lang);
          PUSH_STATE(s_body_fld_dsp);
        }
        break;
      STATE_CASE(s_body_ext_mpart_opt_fld_lang);
        if (c != ' ') {
          p--;
          POP_STATE();
        }
        else {
          SET_STATE(s_body_ext_mpart_opt_fld_loc);
          PUSH_STATE(s_body_fld_lang);
        }
        break;
      STATE_CASE(s_body_ext_mpart_opt_fld_loc);
        if (c != ' ') {
          p--;
          POP_STATE();
        }
        else {
          SET_STATE(s_body_ext_mpart_opt_body_ext);
          PUSH_STATE(s_body_fld_loc);
        }
        break;
      STATE_CASE(s_body_ext_mpart_opt_body_ext);
        if (c != ' ') {
          p--;
          POP_STATE();
        }
        else {
          SET_STATE(s_body_ext_mpart_opt_body_ext);
          PUSH_STATE(s_body_extension);
        }
        break;



      /**
       * FUNCTION body-fld-dsp
       * FORMAT   "(" string SP body-fld-param ")" / nil
       */
      STATE_CASE(s_body_fld_dsp_start);
        if (c != '(') {
          if (c == 'N') {
            SET_STATE(s_nil_start);
          }
          else {
            ERR();
          }
        }
        SET_STATE(s_body_fld_dsp);
        break;
      STATE_CASE(s_body_fld_dsp);
        SET_STATE(s_closeparen);
        PUSH_STATE(s_body_fld_param_start);
        PUSH_STATE(s_sp);
        PUSH_STATE(s_string);
        break;


      /**
       * FUNCTION body-fld-lang
       */
      STATE_CASE(s_body_fld_lang);
        if (c != '(') {
          p--;
          SET_STATE(s_nstring);
        }
        else {
          SET_STATE(s_body_fld_lang_done);
          PUSH_STATE(s_string);
        }
        break;
      STATE_CASE(s_body_fld_lang_done);
        if (c == ' ') {
          SET_STATE(s_body_fld_lang_done);
          PUSH_STATE(s_string);
        }
        else if (c != ')') {
          ERR();
        }
        else {
          POP_STATE();
        }
        break;


      /**
       * FUNCTION body-fld-loc
       */
      STATE_CASE(s_body_fld_loc);
        p--;
        SET_STATE(s_nstring);
        break;


      /**
       * FUNCTION body-extension
       */
      STATE_CASE(s_body_extension);
        if (c == '(') {
          SET_STATE(s_body_extension_done);
          PUSH_STATE(s_body_extension);
        }
        else if (IS_DIGIT(c)) {
          p--;
          SET_STATE(s_number_start);
        }
        else {
          p--;
          SET_STATE(s_nstring);
        }
        break;
      STATE_CASE(s_body_extension_done);
        if (c == ' ') {
          SET_STATE(s_body_extension_done);
          PUSH_STATE(s_body_extension);
        }
        else if (c == ')') {
          POP_STATE();
        }
        else {
          ERR();
        }
        break;

      /**
       * FUNCTION body-fields
       * FORMAT   body-fld-param SP body-fld-id SP body-fld-desc SP body-fld-enc SP body-fld-octets
       */
      STATE_CASE(s_body_fields);
        SET_STATE(s_number_start);   // fld-octets
        PUSH_STATE(s_sp);
        PUSH_STATE(s_string);   // fld-enc
        PUSH_STATE(s_sp);
        PUSH_STATE(s_nstring);  // fld-desc
        PUSH_STATE(s_sp);
        PUSH_STATE(s_nstring);  // fld-id
        PUSH_STATE(s_sp);
        PUSH_STATE(s_body_fld_param_start);
        p--;
        break;


      /**
       * FUNCTION body-fld-param
       * FORMAT   "(" string SP string *(SP string SP string) ")" / nil
       */
      STATE_CASE(s_body_fld_param_start);
        if (c == 'N') {
          p--;
          SET_STATE(s_nil_start);
          break;
        }
        else if (c != '(') {
          ERR();
          break;
        }
        SET_STATE(s_body_fld_param);
        break;
        // Fall through
      STATE_CASE(s_body_fld_param);
        SET_STATE(s_body_fld_param_done);
        PUSH_STATE(s_string);
        PUSH_STATE(s_sp);
        PUSH_STATE(s_string);
        p--;
        break;
      STATE_CASE(s_body_fld_param_done);
        if (c == ')') {
          POP_STATE();
        }
        else if (c == ' ') {
          SET_STATE(s_body_fld_param);
        }
        else {
          ERR();
        }
        break;


      /**
       * FUNCTION body-fld-lines
       * FORMAT   number
       */
      STATE_CASE(s_body_fld_lines);
        p--;
        SET_STATE(s_number_start);
        break;


      /**
       * FUNCTION mailbox-list
       */
      STATE_CASE(s_mailbox_list_start);
        if (c != '(') ERR();
        SET_STATE(s_mailbox_list_flags);
        break;
      STATE_CASE(s_mailbox_list_flags);
        if (c == ')') {
          SET_STATE(s_sp);
          PUSH_STATE(s_mailbox_list_str);
          break;
        }
        if (c != '\\') {
          break;
        }
        if (c != ' ') {
          p--;
        }
        SET_STATE(s_mbx_list_flag_start);
        break;
      STATE_CASE(s_mailbox_list_str);
        SET_STATE(s_mailbox);
        PUSH_STATE(s_sp);
        if (c == '"') {
          PUSH_STATE(s_quoted_start);
        }
        else {
          PUSH_STATE(s_nil_start);
        }
        p--;
        break;


      /**
       * FUNCTION mbx-list-flag
       */
      STATE_CASE(s_mbx_list_flag_start);
        if (c != '\\') ERR();
        str_start = p;
        SET_STATE(s_mbx_list_flag);
        break;
      STATE_CASE(s_mbx_list_flag);
        if (!IS_ATOM_CHAR(c)) {
          CB_ONDATA(p, IMAP_MBXFLAG);
          SET_STATE(s_mailbox_list_flags);
          p--;
        }
        break;


      // Start of ( tag SP resp-code-state CRLF )
      STATE_CASE(s_response_tagged_start);
        // Fall through
      // Start of ( 1*<STRING-CHAR except "+"> )
      STATE_CASE(s_tag_start);
        index = 0;
        SET_STATE(s_tag);
        str_start = p;
        // fall through
      STATE_CASE(s_tag);
        if (IS_ASTRING_CHAR(c) && c != '+') {
          index++;
        }
        else {
          if (index == 0) ERR();
          else {
            CB_ONDATA(p, IMAP_TAG);
            SET_STATE(s_response_tagged_mid);
            p--;
          }
        }
        break;

      STATE_CASE(s_response_tagged_mid);
        index = 0;
        if (c != ' ') ERR();
        SET_STATE(s_resp_cond_state);

        break;

      // Start of ("OK" / "NO" / "BAD") SP resp-text
      STATE_CASE(s_resp_cond_state);
        if (index == 0) {
          str_start = p;
          switch (c) {
            case 'O': cur_string = STR_OK;  break;
            case 'N': cur_string = STR_NO;  break;
            case 'B': cur_string = STR_BAD; break;
            default: ERR();
          }
        }
        else {
          str = strings[cur_string];
          if (c == ' ' && str[index] == '\0') {
            SET_STATE(s_resp_text);
            CB_ONDATA(p, IMAP_STATE);
            break;
          }
          else if (str[index] != c) {
            ERR();
          }
        }
        index++;
        break;

      // Start of ["[" resp-text-code "]" SP] text
      STATE_CASE(s_resp_text);
        if (c == '[') {
          SET_STATE(s_resp_text_code_start);
          break;
        }
        p--;
        SET_STATE(s_text_start);
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
            break;
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
                if (c == ' ') ERR(); // TODO: These have a space at the start
                SET_STATE(s_text_start);
//                PRN("TEXTCODE", str_start, p);
                CB_ONDATA(p, IMAP_TEXTCODE);
                break;
              case STR_UIDNEXT:
              case STR_UIDVALIDITY:
              case STR_UNSEEN:
                if (c == ']') ERR();
                SET_STATE(s_resp_text_code_almost_done);
                PUSH_STATE(s_nz_number_start);
//                PRN("TEXTCODE", str_start, p);
                CB_ONDATA(p, IMAP_TEXTCODE);
                break;
              case STR_PERMANENTFLAGS:
                if (c != ' ') ERR();
                SET_STATE(s_resp_text_code_almost_done);
                PUSH_STATE(s_permanentflags_args_start);
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
        SET_STATE(s_resp_text_code_badcharset_args_done);
        PUSH_STATE(s_astring_start);
        break;
      STATE_CASE(s_resp_text_code_badcharset_args_done);
        if (c == ' ') {
          SET_STATE(s_resp_text_code_badcharset_args_done);
          PUSH_STATE(s_astring_start);
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
          CB_ONDATA(p, IMAP_CAPABILITY);
          p--;
        }
        break;


      // Use as a general function to get a list of flags, not JUST permanentflags
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
          POP_STATE();
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
          CB_ONDATA(p+1, IMAP_FLAG);
        }
        else if (IS_ATOM_CHAR(c)) {
          SET_STATE(s_flag_perm);
        }
        else if (last_char != '\\') {
          // accounts for flags that are a single atom-char
          SET_STATE(s_permanentflags_args_done);
          CB_ONDATA(p, IMAP_FLAG);
          p--;
        }
        else ERR();
        break;
      STATE_CASE(s_flag_perm);
        if (!IS_ATOM_CHAR(c)) {
          SET_STATE(s_permanentflags_args_done);
          CB_ONDATA(p, IMAP_FLAG);
          p--;
        }
        break;


      STATE_CASE(s_resp_text_code_atom_test);

      STATE_CASE(s_resp_text_code_atom);
        break;


      /**
       * FUNCTION mailbox_status_att
       * FORMAT   "MESSAGES" / "RECENT" / "UIDNEXT" / "UIDVALIDITY" / "UNSEEN"
       */
      STATE_CASE(s_mailbox_status_att_start);
        index = 0;
        str_start = p;
        SET_STATE(s_mailbox_status_att);
      STATE_CASE(s_mailbox_status_att);
        if (index == 0) {
          switch (c) {
            case 'M':
              cur_string = STR_MESSAGES;
              break;
            case 'R':
              cur_string = STR_RECENT;
              break;
            case 'U':
              cur_string = STR_UIDNEXT;
              break;
            default:
              ERR();
          }
        }
        else if (index == 1 && cur_string == STR_UIDNEXT && c == 'N') {
          cur_string = STR_UNSEEN;
        }
        else if (index == 3 && cur_string == STR_UIDNEXT && c == 'V') {
          cur_string = STR_UIDVALIDITY;
        }
        str = strings[cur_string];

        if (str[index] == '\0') {
          CB_ONDATA(p, IMAP_STATUS_ATT);
          p--;
          POP_STATE();
        }
        else if (str[index] != c) {
          ERR();
        }

        index++;
        break;


      /**
       * FUNCTION mailbox_status_att_list
       * FORMAT   "(" [ status-att SP number *(SP status-att SP number) ] ")"
       */
      STATE_CASE(s_mailbox_status_att_list_start);
        if (c != '(') ERR();
        SET_STATE(s_mailbox_status_att_list_opt);
        PUSH_STATE(s_number_start);
        PUSH_STATE(s_sp);
        PUSH_STATE(s_mailbox_status_att_start);
        break;

      STATE_CASE(s_mailbox_status_att_list_opt);
        if (c == ' ') {
          PUSH_STATE(s_number_start);
          PUSH_STATE(s_sp);
          PUSH_STATE(s_mailbox_status_att_start);
        }
        else if (c == ')') {
          POP_STATE();
        }
        else {
          ERR();
        }
        break;


      /**
       * FUNCTION datetime
       * FORMAT   """ ((SP DIGIT) / 2DIGIT) "-" "Jan" "-" 4DIGIT SP (2DIGIT ":" 2DIGIT ":" 2DIGIT) SP ("+" / "-") 4DIGIT """
       * In reality: "[^"]{26}"
       * Total string is 28 characters
       */
      STATE_CASE(s_datetime_start);
        if (c != '"') ERR();
        index = 0;
        SET_STATE(s_datetime);
        str_start = p+1; // TODO better?
        break;
      STATE_CASE(s_datetime);
        if (index == 26) {
          if (c == '"') {
            POP_STATE();
            CB_ONDATA(p, IMAP_DATETIME);
          }
          else ERR();
        }
        else if (c == '"') ERR();
        index++;
        break;


      /**
       * FUNCTION closeparen
       * FORMAT   ")"
       */
      STATE_CASE(s_closeparen);
        if (c != ')') ERR();
        POP_STATE();
        break;


      /**
       * FUNCTION uniqueid
       * FORMAT   nz-number
       */
      STATE_CASE(s_uniqueid);
        p--;
        SET_STATE(s_nz_number_start);
        break;


      /**
       * FUNCTION nstring
       * FORMAT   string / nil
       */
      STATE_CASE(s_nstring);
        if (c == 'N') {
          SET_STATE(s_nil_start);
        }
        else {
          SET_STATE(s_string);
        }
        p--;
        break;


      /**
       * FUNCTION sp
       * FORMAT   " "
       */
      STATE_CASE(s_sp);
        if (c != ' ') ERR();
        POP_STATE();
        break;


      /**
       * FUNCTION mailbox
       */
      STATE_CASE(s_mailbox);
        p--;
        SET_STATE(s_astring_start);
        break;


      /**
       * FUNCTION text
       * FORMAT   1*TEXT-CHAR
       */
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
       * FUNCTION nil
       * FORMAT   "NIL"
       */
      STATE_CASE(s_nil_start);
        index = 0;
        SET_STATE(s_nil);
        // Fall through
      STATE_CASE(s_nil);
        if ((index == 0 && c == 'N') || (index == 1 && c == 'I') || (index == 2 && c == 'L')) {
          if (index == 2) {
            POP_STATE();
            CB_ONDONE(IMAP_NIL);
          }
        }
        else {
          ERR();
        }
        index++;
        break;


      /**
       * FUNCTION astring
       * FORMAT   1*ASTRING-CHAR / string
       */
      STATE_CASE(s_astring_start);
        switch (c) {
          case '{':
          case '"':
            SET_STATE(s_string);
            p--;
            break;
          default:
            if (!IS_ASTRING_CHAR(c)) ERR();
            SET_STATE(s_astring);
            str_start = p;
            break;
        }
        break;
      STATE_CASE(s_astring);
        if (!IS_ASTRING_CHAR(c)) {
          CB_ONDATA(p, IMAP_ASTRING);
          POP_STATE();
          p--;
        }
        break;


      /**
       * FUNCTION string
       * FORMAT   quoted / literal
       */
      STATE_CASE(s_string);
        if (c == '{') {
          SET_STATE(s_literal_start);
          p--;
        }
        else if (c == '"') {
          SET_STATE(s_quoted_start);
          p--;
        }
        else {
          ERR();
        }
        break;


      /**
       * FUNCTION number
       * FORMAT   1*DIGIT
       */
      STATE_CASE(s_number_start);
        if (!IS_DIGIT(c)) ERR();
        SET_STATE(s_number);
        str_start = p;
        break;
      STATE_CASE(s_number);
        if (!IS_DIGIT(c)) {
          POP_STATE();
          CB_ONDATA(p, IMAP_NUMBER);
          p--;
        }
        break;


      /**
       * FUNCTION nz_number
       * FORMAT   %x31-%x39 *DIGIT
       */
      STATE_CASE(s_nz_number_start);
        if (c < '1' || c > '9') ERR();
        SET_STATE(s_nz_number);
        str_start = p;
        break;
      STATE_CASE(s_nz_number);
        if (!IS_DIGIT(c)) {
          POP_STATE();
          CB_ONDATA(p, IMAP_NUMBER);
          p--;
          break;
        }
        break;


      /**
       * FUNCTION literal
       * FORMAT   "{" number "}" CRLF *CHAR8
       */
      STATE_CASE(s_literal_start);
        if (c != '{') ERR();
        SET_STATE(s_literal_number_start);
        break;
      STATE_CASE(s_literal_number_start);
        if (!IS_DIGIT(c)) ERR();
        SET_STATE(s_literal_number);
        bytes_remaining = c - '0';
        str_start = p;
        break;
      STATE_CASE(s_literal_number);
        if (!IS_DIGIT(c)) {
          if (c != '}') ERR();
          CB_ONDATA(p, IMAP_LITERAL_SIZE);
          SET_STATE(s_literal_chars);
          PUSH_STATE(s_check_crlf);
        }
        else {
          bytes_remaining *= 10;
          bytes_remaining += c - '0';
        }
        break;
      STATE_CASE(s_literal_chars);
        // TOO Make this work across several buffers
        index = (bytes_remaining < (pe-p))?bytes_remaining:(pe-p);
        str_start = p;
        CB_ONDATA(p+index, IMAP_LITERAL);
        p += index-1;
        POP_STATE();
        break;


      /**
       * FUNCTION quoted
       * FORMAT   """ *QUOTED-CHAR """
       */
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
          CB_ONDATA(p, IMAP_QUOTED);
          POP_STATE();
        }
        break;
      STATE_CASE(s_quoted_escaped);
        if (!IS_QUOTED_SPECIAL(c)) ERR();
        SET_STATE(s_quoted);
        break;


      /**
       * FUNCTION check_crlf
       * FORMAT   [ "\r" ] "\n"
       */
      STATE_CASE(s_check_crlf);
        if (c == '\r') {
          SET_STATE(s_check_lf);
          break;
        }
      STATE_CASE(s_check_lf);
        if (c == '\n') {
          POP_STATE();
        }
        else {
          ERR();
        }
        break;


      /**
       * RESPONSE Completion
       */
      STATE_CASE(s_final_crlf);
        if (c == '\r') {
          SET_STATE(s_final_lf);
          break;
        }
      STATE_CASE(s_final_lf);
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
  parser->ch = c;

  return (p-data);
}

