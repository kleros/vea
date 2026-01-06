# Validator bot

A collection of bots for the Vea challenger and bridger ecosystem.

- src/watcher.ts

# pm2

`pm2 start`

By default, the watcher performs two core functions:

- Bridger: Submits stored snapshots to the fast bridge receiver.
- Challenger: Challenges any detected invalid claims.

# flags

`--saveSnapshot`

Enables snapshot saving on the inbox when the bot observes a valid state.

`--path=challenger | bridger | both`

- challenger: Only challenge invalid claims
- bridger: Only submit snapshots
- both: Default mode, acts as both challenger and bridger

# Example usage

Run as both challenger and bridger with snapshots enabled:

`pm2 start -- --saveSnapshot`

Run only as challenger:

`pm2 start dist/watcher.js -- --path=challenger`
