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

  search: (args..., cb) ->
    @client.search args..., cb
  fetch: (args..., cb) ->
    

  status: (args..., cb) ->
    @client.status cb
