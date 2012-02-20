(function() {
  var client;

  client = require('./client');

  exports.Client = client;

  exports.CommandError = client.CommandError;

  exports.CommandFailure = client.CommandFailure;

  exports.createClient = client.createClient;

}).call(this);
