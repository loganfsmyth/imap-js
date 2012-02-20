(function() {
  var client;

  client = require('./client');

  exports.createClient = client.createClient;

  exports.Client = client;

  exports.CommandError = client.CommandError;

  exports.CommandFailure = client.CommandFailure;

}).call(this);
