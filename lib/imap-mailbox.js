(function() {
  var ImapMailbox, MessageSet;
  MessageSet = require('./imap-messageset').MessageSet;
  /* Mailbox
  #
  */
  ImapMailbox = (function() {
    function ImapMailbox(client, name) {
      this.client = client;
      this.name = name;
      this.deleted = false;
    }
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
    ImapMailbox.prototype.status = function(items, cb) {
      return this.client.status(this.name, items, cb);
    };
    ImapMailbox.prototype.search = function(criteria, cb) {
      return this.client.search('UTF-8', criteria, true, function(err, resp, result) {
        if (err) {
          return cb(err, null);
        } else {
          return cb(null, new MessageSet(this.client, result));
        }
      });
    };
    ImapMailbox.prototype.fetch = function(sequence, uid, item_names, cb) {
      var set;
      set = new MessageSet(this.client, sequence);
      return set.fetch(uid, item_names, function(err) {
        if (err) {
          return cb(err);
        } else {
          return cb(null, set);
        }
      });
    };
    return ImapMailbox;
  })();
}).call(this);
