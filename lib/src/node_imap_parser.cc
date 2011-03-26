
#include <v8.h>
#include <node.h>
#include <node_buffer.h>

#include "imap_parser.h"

#include <string.h>

using namespace node;
using namespace v8;

Persistent<FunctionTemplate> ImapParserNew;

static imap_parser_settings settings;


class ImapParser: public ObjectWrap {
private:
  imap_parser parser;
  bool got_exception_;

  Local<Value>* current_buffer;
  char* current_buffer_data;

  void Init() {
    imap_parser_init(&parser);
    parser.data = this;
  }

public:
  ImapParser() {
    Init();
  }

  ~ImapParser() {
  }

  static Handle<Value> New(const Arguments& args) {
    HandleScope scope;
    ImapParser *self = new ImapParser();
    self->Wrap(args.This());
    return args.This();
  }

  static Handle<Value> Reinitialize(const Arguments& args) {
    HandleScope scope;
    ImapParser *self = ObjectWrap::Unwrap<ImapParser>(args.This());

    self->Init();

    return Undefined();
  }

  static Handle<Value> Execute(const Arguments& args) {
    HandleScope scope;
    ImapParser *self = ObjectWrap::Unwrap<ImapParser>(args.This());

    Local<Value> buffer_arg = args[0];
    if (!Buffer::HasInstance(buffer_arg)) {
      return ThrowException(Exception::TypeError(String::New("Buffer argument needed")));
    }

    Local<Object> buffer = buffer_arg->ToObject();
    char* buffer_data = Buffer::Data(buffer);
    size_t buffer_len = Buffer::Length(buffer);

    size_t offset = args[1]->Int32Value();
    size_t length = args[2]->Int32Value();

    if (offset >= buffer_len) {
      return ThrowException(Exception::Error(String::New("Offset larger than buffer")));
    }
    if (offset + length > buffer_len) {
      return ThrowException(Exception::Error(String::New("Length from offset larger than buffer")));
    }

    // Referencing local variable, dangerous but resetting to NULL in a few lines
    self->current_buffer = &buffer_arg;
    self->current_buffer_data = buffer_data;

    self->got_exception_ = false;

    size_t parsed_amount = imap_parser_execute(&(self->parser), &settings, buffer_data + offset, length );

    self->current_buffer = NULL;
    self->current_buffer_data = NULL;

    if (self->got_exception_) return Local<Value>();

    Local<Integer> parsed_amount_val = Integer::New(parsed_amount);
    if (parsed_amount != length) {
      Local<Value> e = Exception::Error(String::NewSymbol("Parse Error"));

      e->ToObject()->Set(String::NewSymbol("attemptedBytes"), Integer::New(length));
      e->ToObject()->Set(String::NewSymbol("bytesParsed"), parsed_amount_val);
      e->ToObject()->Set(String::NewSymbol("parsedTo"), String::New(buffer_data, parsed_amount));
      e->ToObject()->Set(String::NewSymbol("failureState"), Integer::New(self->parser.state));

      return ThrowException(e);
    }
    else {
      return scope.Close(parsed_amount_val);
    }
  }


  /**
   * Callbacks from parser
   * They just trigger their related JS functions
   */
  static int on_data(imap_parser* parser, const char* data, size_t len) {
    ImapParser *self = static_cast<ImapParser*>(parser->data);
    Local<Value> cb_value = self->handle_->Get(String::NewSymbol("onData"));
    if (!cb_value->IsFunction()) return 0;
    Local<Function> cb = Local<Function>::Cast(cb_value);
    Local<Value> argv[3] = {
      *self->current_buffer,
      Integer::New(data - self->current_buffer_data),
      Integer::New(len),
    };
    Local<Value> ret = cb->Call(self->handle_, 3, argv);
    if (ret.IsEmpty()) {
      self->got_exception_ = true;
      return -1;
    }
    else {
      return 0;
    }
  }
  static int on_number(imap_parser* parser, unsigned int number) {
    ImapParser *self = static_cast<ImapParser*>(parser->data);
    Local<Value> cb_value = self->handle_->Get(String::NewSymbol("onNumber"));
    if (!cb_value->IsFunction()) return 0;
    Local<Function> cb = Local<Function>::Cast(cb_value);
    Local<Value> argv[1] = {
      Integer::New(number),
    };
    Local<Value> ret = cb->Call(self->handle_, 1, argv);
    if (ret.IsEmpty()) {
      self->got_exception_ = true;
      return -1;
    }
    else {
      return 0;
    }
  }
  static int on_done(imap_parser* parser, unsigned int type) {
    ImapParser *self = static_cast<ImapParser*>(parser->data);
    Local<Value> cb_value = self->handle_->Get(String::NewSymbol("onDone"));
    if (!cb_value->IsFunction()) return 0;
    Local<Function> cb = Local<Function>::Cast(cb_value);
    Local<Value> argv[1] = {
      Integer::New(type),
    };
    Local<Value> ret = cb->Call(self->handle_, 1, argv);
    if (ret.IsEmpty()) {
      self->got_exception_ = true;
      return -1;
    }
    else {
      return 0;
    }
  }
};




extern "C" {
  static void init (Handle<Object> target)
  {
    HandleScope scope;

    settings.on_data    = ImapParser::on_data;
    settings.on_done    = ImapParser::on_done;
    settings.on_number  = ImapParser::on_number;


    Local<FunctionTemplate> t = FunctionTemplate::New(ImapParser::New);
    ImapParserNew = Persistent<FunctionTemplate>::New(t);
    ImapParserNew->InstanceTemplate()->SetInternalFieldCount(1);
    ImapParserNew->SetClassName(String::NewSymbol("ImapParser"));
    NODE_SET_PROTOTYPE_METHOD(ImapParserNew, "reinitialize", ImapParser::Reinitialize);
    NODE_SET_PROTOTYPE_METHOD(ImapParserNew, "execute", ImapParser::Execute);
    target->Set(String::NewSymbol("ImapParser"), ImapParserNew->GetFunction());
  }

  NODE_MODULE(imap_parser_native, init); // Must match file name
}
