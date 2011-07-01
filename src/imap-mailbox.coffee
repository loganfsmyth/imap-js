
### Mailbox
#
#### Events
# * 'newmessage'  
#   The 'newmessage' event is triggered when a new message arrive in an mailbox.
# * 'deleted'  
#   The 'deleted' event is triggered when the mailbox is deleted by this client
#   OR in another session.
#
class ImapMailbox
  constructor: (@client, @name) ->
    @deleted = false

  ensureSelected: ->
    @client.select @name if @client.selected() != @name

  check: (cb) ->
    @client.check @name, cb
  expunge: (cb) ->
    @client.expunge @name, cb
  subscribe: (cb) ->
    @client.subscribe @name, cb
  unsubscribe: (cb) ->
    @client.unsubscribe @name, cb
  list: (cb) ->
    @client.list @name, cb
  lsub: (cb) ->
    @client.lsub @name, cb


  rename: (name, cb) ->
    @client.rename @name, name, (err, resp) ->
      @name = name if not err
      cb err, resp

  delete: (cb) ->
    @client.delete @name, (err, resp) ->
      @deleted = true
      cb err, resp

  status: (args..., cb) ->
    @client.status cb



  # These two return MessageSets
  search: (args..., cb) ->
    @client.search args..., cb
  fetch: (args..., cb) ->
    

