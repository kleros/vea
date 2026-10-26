#
# Builder image
#

# Node version for Vea
FROM node:24.14-alpine3.23 AS relayer-build

# Yarn version for Vea
ARG YARN_VERSION=4.6.0
RUN corepack enable \
  && corepack prepare "yarn@${YARN_VERSION}" --activate

USER node
WORKDIR /home/node/monorepo

#
# Dependencies installation step.
#

# Global monorepo dependencies
COPY --chown=node:node ./.yarn/releases/ ./.yarn/releases/
COPY --chown=node:node package.json yarn.lock .yarnrc.yml ./

# 
# Packages dependencies
#
COPY --chown=node:node ./relayer-cli/package.json relayer-cli/
COPY --chown=node:node ./contracts/package.json contracts/

# We skip the `yarn cache clean` after install to speed up subsequent installs
# (mostly the yarn workspace focus)
RUN --mount=type=cache,id=yarn-cache,target=/home/node/monorepo/.yarn,uid=1000,gid=1000 \
  YARN_IGNORE_PATH=1 yarn install

# 
# Source code copy step.
#
COPY --chown=node:node relayer-cli ./relayer-cli
COPY --chown=node:node contracts ./contracts

# 
# Build step to generate contract artifacts and typechain types
#
RUN [ -d contracts/typechain-types ] && echo "TypeChain present, skipping build" || yarn workspace @kleros/vea-contracts build
RUN yarn workspaces focus @kleros/vea-relayer-cli



# ----------------------------------------------------------------------------------------------------
# ----------------------------------------------------------------------------------------------------
# ----------------------------------------------------------------------------------------------------


#
# Deployable image
#
# This is the final layer that will be deployed and run

# Node version for all Vea
FROM node:24.14-alpine3.23 AS relayer

# Yarn version for all Vea
ARG YARN_VERSION=4.6.0
# `corepack enable` writes the yarn shim to /usr/local/bin, so it runs as root. Yarn
# itself is prepared as node, the user the container runs as: corepack caches it in
# the running user's home, and a cache under /root sent every container start to
# repo.yarnpkg.com for Yarn again. With the network off, a missed cache fails the
# start loudly instead of fetching an unpinned Yarn into the process holding the key.
RUN corepack enable \
  && mkdir -p /home/node/monorepo/.yarn && chown -R node:node /home/node/monorepo

USER node
RUN corepack prepare "yarn@${YARN_VERSION}" --activate
ENV COREPACK_ENABLE_NETWORK=0
WORKDIR /home/node/monorepo

# Copy only the necessary files from the builder stage
COPY --from=relayer-build --link /home/node/monorepo/contracts/typechain-types ./contracts/typechain-types
COPY --from=relayer-build --link /home/node/monorepo/contracts/deployments ./contracts/deployments

# Copy the globally required files and the service workspace
COPY --from=relayer-build --link /home/node/monorepo/node_modules /home/node/monorepo/node_modules
COPY --from=relayer-build --link \
  /home/node/monorepo/.yarnrc.yml \
  /home/node/monorepo/yarn.lock \
  /home/node/monorepo/package.json \
  ./

COPY --from=relayer-build --link /home/node/monorepo/relayer-cli ./relayer-cli

WORKDIR /home/node/monorepo/relayer-cli

# The copy above lands root-owned (--link), so state/ (the tracked checkpoints, never a host
# lock file: .dockerignore) is handed to node here as root; mkdir covers a context without it.
USER root
RUN mkdir -p /home/node/monorepo/relayer-cli/state && chown -R node:node /home/node/monorepo/relayer-cli/state
USER node
ENV YARN_IGNORE_PATH=1
CMD ["yarn", "start-relayer"]