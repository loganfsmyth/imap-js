
client = require './client'

# Rather than document these in several places, just view the 'client.coffee'
# file for documentation.
exports.createClient = client.createClient
exports.Client = client
exports.CommandError = client.CommandError
exports.CommandFailure = client.CommandFailure


