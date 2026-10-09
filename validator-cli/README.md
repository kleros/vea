# Validator bot

A collection of bots for the Vea challenger and bridger ecosystem.

- src/watcher.ts

# docker

Create the env file first — both compose files declare it as required, so they
fail immediately without it. From the repo root:

`cp validator-cli/.env.dist validator-cli/.env`

Run the image published to GHCR (from the repo root):

`docker compose up validator`

Or build it from this working tree instead:

`docker compose -f docker-compose.build.yml build validator`

`docker compose -f docker-compose.build.yml up validator`

By default, the validator performs two core functions:

- Bridger: Saves snapshots, submits stored snapshots to the fast bridge receiver.
- Challenger: Challenges any detected invalid claims and relays the correct snapshot.

# deposits and withdrawals

Claim and challenge deposits must be withdrawn to an EOA. The outbox refunds a
deposit (and pays a reward) to the address that made the claim or the challenge,
and on the Sepolia route (`VeaOutboxArbToEth`) it does so with an unchecked
`send`: if that address is a contract that cannot accept ETH with the 2300 gas
`send` forwards, the withdrawal succeeds and the funds are lost. The bot claims
and challenges from the address of `PRIVATE_KEY`, which is an EOA; do not make
claims or challenges for this bot from a multisig or other contract wallet. The
Chiado route pays in WETH with a checked `transfer`, but keep the same rule.

# startup checks

Before the first cycle the validator checks its whole configuration and refuses
to start, listing every problem at once, when:

- a variable is missing or malformed (`HEARTBEAT_URL`, when set, must be https);
- any single URL of an RPC list answers with a chain id other than the route
  expects (each URL is probed on its own, not only the one that answers first);
- an RPC list has no URL left that answers at all;
- the outbox at the configured address does not return, for a synthetic claim,
  the same `hashClaim` the validator computes (wrong address, ABI or chain).

A URL that does not answer at startup, the first of a list included, is a
warning and an `alert` log with code `rpc_url_unreachable`, not a startup
failure: it is removed from every list that holds it (`RPC_ETH` feeds both the
Sepolia outbox and the Chiado router) and the bot runs on the others. A pruned
URL comes back only after a restart, so restart the validator once the endpoint
is up again to restore that fallback.

A signer with no native balance on a route is a warning and an `alert` log with
code `route_unfunded`, not a startup failure: the other routes keep running.
RPC URLs are logged as `scheme://host` only; keys in the path, query or userinfo
never reach the logs.

# flags

Flags are passed as the container's command. Set them on the `validator` service
in whichever compose file you use — `docker-compose.yml` for the published image,
`docker-compose.build.yml` when building from source:

`command: yarn start --saveSnapshot --path=challenger`

Both compose files set `command:`, which replaces the image's `CMD`, so editing
`CMD` in `validator-cli/Dockerfile` has no effect when starting via compose; it
applies only to a direct `docker run`. Outside Docker, append the flags to
`yarn start`.

`--saveSnapshot`

Enables snapshot saving on the inbox when the bot observes a valid state.

`--path=claimer | challenger | both`

- claimer: Only submit snapshots — this is the "Bridger" role described above
- challenger: Only challenge invalid claims
- both: Default mode, acts as both claimer and challenger

The accepted value is `claimer`, not `bridger`; `--path=bridger` throws `InvalidBotPathError`.

# testing

Tests are written with [Jest](https://jestjs.io/) (via `ts-jest`).

Run the full suite with coverage:

`yarn test`

Run a single test file:

`yarn jest src/helpers/validator.test.ts`

Run tests matching a name pattern:

`yarn jest -t "snapshot"`

Run in watch mode while developing:

`yarn jest --watch`
