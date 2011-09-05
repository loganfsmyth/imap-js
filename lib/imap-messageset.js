(function() {
  var MessageSet;
  exports.MessageSet = MessageSet = (function() {
    function MessageSet(client, sequence) {
      this.client = client;
      this.sequence = sequence;
      this.messages = [];
      this.uid = false;
    }
    MessageSet.prototype.store = function(action, flags, cb) {};
    MessageSet.prototype.copyTo = function(mailbox, cb) {
      return this.client.copy(this.sequence, mailbox.name, this.uid, cb);
    };
    MessageSet.prototype.search = function(criteria, cb) {
      if (criteria) {
        criteria += ' ';
      } else {
        criteria = '';
      }
      if (this.uid) {
        criteria += "UID ";
      }
      criteria += this.sequence;
      return this.client.search('UTF-8', criteria, this.uid, function(err, resp, results) {
        if (err) {
          return cb(err);
        } else {
          return cb(null, new MessageSet(this.client, results));
        }
      });
    };
    MessageSet.prototype.fetch = function(uid, item_names, cb) {
      return this.client.fetch(this.sequence, item_names, uid, function(err, resp, results) {
        this.messages = results;
        this.uid = uid;
        return cb(err);
      });
    };
    return MessageSet;
  })();
}).call(this);
