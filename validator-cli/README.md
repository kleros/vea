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
