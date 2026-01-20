# Relayer bot

A collection of bots for the Vea relayers.

- src/relayer.ts

# docker

`docker compose build relayer`

`docker compose up relayer`

Runs a relayer for all messages sent through VeaInbox contracts.

# `env` config

- `VEAOUTBOX_CHAINS`: to chose the chains to execute messages on.

- Address params: used to execute for specific sender addresses or everyone if zero address is provided.

- `SENDER_ADDRESSES`: pass zero address to allow all senders and relayer or executor for hashi.
