(function() {
  var ImapMailbox;
  var __slice = Array.prototype.slice;
  ImapMailbox = (function() {
    function ImapMailbox(client, name) {
      this.client = client;
      this.name = name;
      this.deleted = false;
    }
    ImapMailbox.prototype.ensureSelected = function() {
      if (this.client.selected() !== this.name) {
        return this.client.select(this.name);
      }
    };
    ImapMailbox.prototype.check = function(cb) {
      return this.client.check(this.name, cb);
    };
    ImapMailbox.prototype.expunge = function(cb) {
      return this.client.expunge(this.name, cb);
    };
    ImapMailbox.prototype.subscribe = function(cb) {
      return this.client.subscribe(this.name, cb);
    };
    ImapMailbox.prototype.unsubscribe = function(cb) {
      return this.client.unsubscribe(this.name, cb);
    };
    ImapMailbox.prototype.list = function(cb) {
      return this.client.list(this.name, cb);
    };
    ImapMailbox.prototype.lsub = function(cb) {
      return this.client.lsub(this.name, cb);
    };
    ImapMailbox.prototype.rename = function(name, cb) {
      return this.client.rename(this.name, name, function(err, resp) {
        if (!err) {
          this.name = name;
        }
        return cb(err, resp);
      });
    };
    ImapMailbox.prototype["delete"] = function(cb) {
      return this.client["delete"](this.name, function(err, resp) {
        this.deleted = true;
        return cb(err, resp);
      });
    };
    ImapMailbox.prototype.search = function() {
      var args, cb, _i, _ref;
      args = 2 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 1) : (_i = 0, []), cb = arguments[_i++];
      return (_ref = this.client).search.apply(_ref, __slice.call(args).concat([cb]));
    };
    ImapMailbox.prototype.fetch = function() {
      var args, cb, _i;
      args = 2 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 1) : (_i = 0, []), cb = arguments[_i++];
    };
    ImapMailbox.prototype.status = function() {
      var args, cb, _i;
      args = 2 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 1) : (_i = 0, []), cb = arguments[_i++];
      return this.client.status(cb);
    };
    return ImapMailbox;
  })();
}).call(this);
