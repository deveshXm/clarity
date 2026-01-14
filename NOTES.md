Developer Notes 

- Send message to users when bot gets installed in a channel
- In a channel if user gets flagged and he doesn't exist in DB, we will send them rephrase to introduce the bot to them and ask them whether they'd like us to keep monitoring them. ( only for people who are not in db)
- If a user tags a bot or installs the bot, it will ask them if they want it to monitor their messages in the channel
- Auto suggestion will work fetches a bit of history of conversation like 10 messages from channel and use that to provide suggestion to user
- New users not in DB get analyzed anyway (discovery mode) - only created if flagged
- When flagged, new users see opt-in prompt: "Want me to monitor this channel?" + Yes button + Learn about Clarity link
- Bot joined channel sends opt-in to inviter only (not all workspace users)
- @mention triggers opt-in prompt if user doesn't have channel monitoring enabled
- `sendChannelOptInMessage` in slack.ts for reusable opt-in ephemeral
- `enable_channel_monitoring` action in interactive route handles Yes button