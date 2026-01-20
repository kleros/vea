# Validator bot

A collection of bots for the Vea challenger and bridger ecosystem.

- src/watcher.ts

# docker

`docker compose build validator`

`docker compose up validator`

By default, the validator performs two core functions:

- Bridger: Saves snapshots, submits stored snapshots to the fast bridge receiver.
- Challenger: Challenges any detected invalid claims and relays the correct snapshot.

# flags

Update Dockerfile for passing different flags

`--saveSnapshot`

Enables snapshot saving on the inbox when the bot observes a valid state.

`--path=challenger | bridger | both`

- challenger: Only challenge invalid claims
- bridger: Only submit snapshots
- both: Default mode, acts as both challenger and bridger
