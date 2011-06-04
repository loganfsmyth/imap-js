class ImapMailbox
  constuctor: (@client, @name) ->
    @deleted = false
    a = 2

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
    @client.fetch

  store: (args..., cb) ->
    @client.store

  copy: (args..., cb) ->
    @client.copy

  status: (args..., cb) ->
    @client.status cb
