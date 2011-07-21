
{MessageSet} = require './imap-messageset'

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

  #### check
  #
  ##### Arguments
  #
  # * *cb* - Completion callback. Format: `function(err) { }`
  #
  check: (cb) ->
    @client.check @name, cb


  #### lsub
  #
  ##### Arguments
  #
  # * *cb* - Completion callback. Format: `function(err) { }`
  #
  expunge: (cb) ->
    @client.expunge @name, cb

  #### subscribe
  #
  ##### Arguments
  #
  # * *cb* - Completion callback. Format: `function(err) { }`
  #
  subscribe: (cb) ->
    @client.subscribe @name, cb

  #### unsubscribe
  #
  ##### Arguments
  #
  # * *cb* - Completion callback. Format: `function(err) { }`
  #
  unsubscribe: (cb) ->
    @client.unsubscribe @name, cb

  #### list
  #
  ##### Arguments
  #
  # * *cb* - Completion callback. Format: `function(err) { }`
  #
  list: (cb) ->
    @client.list @name, cb

  #### lsub
  #
  ##### Arguments
  #
  # * *cb* - Completion callback. Format: `function(err) { }`
  #
  lsub: (cb) ->
    @client.lsub @name, cb


  #### rename
  #
  ##### Arguments
  #
  # * *name*  - The new name of the mailbox.
  # * *cb*    - Completion callback. Format: `function(err) { }`
  #
  rename: (name, cb) ->
    @client.rename @name, name, (err, resp) ->
      @name = name if not err
      cb err, resp


  #### delete
  #
  ##### Arguments
  #
  # * *cb* - Deletion callback function. Format: `function(err) { }`
  #
  delete: (cb) ->
    @client.delete @name, (err, resp) ->
      @deleted = true
      cb err, resp


  #### status
  #
  ##### Arguments
  #
  # * *items* - Which status items to request. (MESSAGES, RECENT, UIDNEXT, UIDVALIDITY, UNSEEN)
  # * *cb*    - Completion callback. Format: `function(err) { }`
  #
  status: (items, cb) ->
    @client.status @name, items, cb



  #### search
  #
  ##### Arguments
  #
  # * *criteria*  - A Search criteria string
  # * *cb*        - The result callback of the format `function(err, messageset) { }`
  # 
  search: (criteria, cb) ->
    @client.search 'UTF-8', criteria, true, (err, resp, result) ->
      if err
        cb err, null
      else
        cb null, new MessageSet @client, result


  #### fetch
  #
  ##### Arguments
  #
  # * *sequence*    - The sequence to fetch
  # * *uid*         - Is the sequence UID values?
  # * *item_names*  - Item names. See Messageset.fetch
  # * *cb*          - The completion callback. Format: `function(err, messageset) { }`
  #
  fetch: (sequence, uid, item_names, cb) ->
    set = new MessageSet @client, sequence
    set.fetch uid, item_names, (err) ->
      if err
        cb err
      else
        cb null, set


