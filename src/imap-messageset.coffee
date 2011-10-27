#
# imap-js - Copyright (c) 2011 Logan Falconer Smyth
#
# Dual licensed under MIT and GPL licenses.
# See MIT-LICENSE.txt and GPL-LICENSE.txt


exports.MessageSet = class MessageSet
  constructor: (@client, @sequence) ->
    @messages = []
    @uid = false

  #### store
  #
  ##### Arguments
  #
  # * *action*  - The action to take with the flags. ('add', 'remove', 'set')
  # * *flags*   - An array of flags.
  # * *cb*      - The 
  #
  store: (action, flags, cb) ->
    

  #### copy
  #
  ##### Arguments
  #
  # * *mailbox* - The mailbox to copy all of these messages into.
  # * *cb*      - The completion callback. Format: `function(err) { }`
  #
  copyTo: (mailbox, cb) ->
    @client.copy @sequence, mailbox.name, @uid, cb

  #### search
  #
  ##### Arguments
  #
  # * *criteria*  - Criteria string for the search.
  # * *cb*        - Callback for search results. Format: `function(err, messageset) { }`
  #
  search: (criteria, cb) ->
    if criteria
      criteria += ' '
    else
      criteria = ''
    
    criteria += "UID " if @uid
    criteria += @sequence

    @client.search 'UTF-8', criteria, @uid, (err, resp, results) ->
      if err
        cb err
      else
        cb null, new MessageSet @client, results

  #### fetch
  #
  ##### Arguments
  #
  # * *uid*         - Should this messageset store results by UID or 
  # * *item_names*  - The items that should be retrieved for this set. e.g. ALL, FAST, FULL
  # * *cb*          - The callback when the fetch is complete. Format: `function(err) { }`
  #
  fetch: (uid, item_names, cb) ->
    @client.fetch @sequence, item_names, uid, (err, resp, results) ->
      @messages = results
      @uid = uid
      cb err
