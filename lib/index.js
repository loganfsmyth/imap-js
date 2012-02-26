(function() {
  var client, ooclient;

  client = require('./client');

  ooclient = require('./ooclient');

  exports.createClient = client.createClient;

  exports.Client = client;

  exports.CommandError = client.CommandError;

  exports.CommandFailure = client.CommandFailure;

  exports.createOOClient = ooclient.createClient;

  exports.OOClient = ooclient;

}).call(this);
