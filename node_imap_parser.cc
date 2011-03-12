
#include <v8.h>
#include <node.h>

using namespace node;
using namespace v8;

class ImapParser: ObjectWrap
{
private:
  int m_count;
public:

  static Persistent<FunctionTemplate> s_ct;
  static void Init(Handle<Object> target)
  {
    HandleScope scope;

    Local<FunctionTemplate> t = FunctionTemplate::New(New);

    s_ct = Persistent<FunctionTemplate>::New(t);
    s_ct->InstanceTemplate()->SetInternalFieldCount(1);
    s_ct->SetClassName(String::NewSymbol("ImapParser"));

    NODE_SET_PROTOTYPE_METHOD(s_ct, "imap", Imap);

    target->Set(String::NewSymbol("ImapParser"),
                s_ct->GetFunction());
  }

  ImapParser() :
    m_count(0)
  {
  }

  ~ImapParser()
  {
  }

  static Handle<Value> New(const Arguments& args)
  {
    HandleScope scope;
    ImapParser* hw = new ImapParser();
    hw->Wrap(args.This());
    return args.This();
  }

  static Handle<Value> Imap(const Arguments& args)
  {
    HandleScope scope;
    ImapParser* hw = ObjectWrap::Unwrap<ImapParser>(args.This());
    hw->m_count++;
    Local<String> result = String::New("Imap!!");
    return scope.Close(result);
  }

};

Persistent<FunctionTemplate> ImapParser::s_ct;

extern "C" {
  static void init (Handle<Object> target)
  {
    ImapParser::Init(target);
  }

  NODE_MODULE(imap_parser, init); // Must match file name
}
