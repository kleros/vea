<p align="center">
  <a href="https://vea.ninja">
    <img alt="Vea" src="https://user-images.githubusercontent.com/22213980/200396519-895ad6ed-2950-476f-89e9-2a648f0fdbce.png?raw=true" width="128">
  </a>
</p>

<p align="center">
  <b style="font-size: 32px;">VEA</b>
</p>

<p align="center">
  <a href="https://api.securityscorecards.dev/projects/github.com/kleros/vea"><img src="https://api.securityscorecards.dev/projects/github.com/kleros/vea/badge" alt="OpenSSF Scorecard"></a>
  </br>
  <!-- DEV BRANCH -->
  <img src="https://img.shields.io/badge/branch-dev-lightgrey">
  <a href="https://github.com/kleros/vea/actions/workflows/contracts-testing.yml"><img src="https://github.com/kleros/vea/actions/workflows/contracts-testing.yml/badge.svg?branch=dev" alt="Contracts Testing"></a>
  <a href="https://sonarcloud.io/summary/new_code?id=kleros_vea"><img src="https://sonarcloud.io/api/project_badges/measure?project=kleros_vea&branch=dev&metric=security_rating" alt="Security Rating"></a>
  <a href="https://sonarcloud.io/summary/new_code?id=kleros_vea"><img src="https://sonarcloud.io/api/project_badges/measure?project=kleros_vea&branch=dev&metric=alert_status" alt="Quality Gate Status"></a>
  <a href="https://sonarcloud.io/summary/new_code?id=kleros_vea"><img src="https://sonarcloud.io/api/project_badges/measure?project=kleros_vea&branch=dev&metric=bugs" alt="Bugs"></a>
  <a href="https://sonarcloud.io/summary/new_code?id=kleros_vea"><img src="https://sonarcloud.io/api/project_badges/measure?project=kleros_vea&branch=dev&metric=reliability_rating" alt="Reliability Rating"></a>
  <a href="https://sonarcloud.io/summary/new_code?id=kleros_vea"><img src="https://sonarcloud.io/api/project_badges/measure?project=kleros_vea&branch=dev&metric=sqale_rating" alt="Maintainability Rating"></a>
  </br>
  <!-- MASTER BRANCH -->
  <img src="https://img.shields.io/badge/branch-master-lightgrey">
  <a href="https://github.com/kleros/vea/actions/workflows/contracts-testing.yml"><img src="https://github.com/kleros/vea/actions/workflows/contracts-testing.yml/badge.svg?branch=master" alt="Contracts Testing"></a>
  <a href="https://sonarcloud.io/summary/new_code?id=kleros_vea"><img src="https://sonarcloud.io/api/project_badges/measure?project=kleros_vea&branch=master&metric=security_rating" alt="Security Rating"></a>
  <a href="https://sonarcloud.io/summary/new_code?id=kleros_vea"><img src="https://sonarcloud.io/api/project_badges/measure?project=kleros_vea&branch=master&metric=alert_status" alt="Quality Gate Status"></a>
  <a href="https://sonarcloud.io/summary/new_code?id=kleros_vea"><img src="https://sonarcloud.io/api/project_badges/measure?project=kleros_vea&branch=master&metric=bugs" alt="Bugs"></a>
  <a href="https://sonarcloud.io/summary/new_code?id=kleros_vea"><img src="https://sonarcloud.io/api/project_badges/measure?project=kleros_vea&branch=master&metric=reliability_rating" alt="Reliability Rating"></a>
  <a href="https://sonarcloud.io/summary/new_code?id=kleros_vea"><img src="https://sonarcloud.io/api/project_badges/measure?project=kleros_vea&branch=master&metric=sqale_rating" alt="Maintainability Rating"></a>
</p>

---

# Vea

Vea is a cross-chain message bridge which enables fast and secure interoperability specifically designed with optimistic rollups in mind.

## About Vea

### What type of bridge is this?

A trust-minimized optimistically-verified bridge, open to any participant to fulfill the roles of Oracle, Challenger or Relayer. The [trust model](https://vitalik.eth.limo/general/2020/08/20/trust.html) requires only 1 live honest verifier, similar to optimistic rollups.

### How is this secure?

As an optimistic bridge, it is cheap and fast to use in the happy case, where an Oracle makes an unchallenged claim.
While in the unhappy case, it is no different than using the canonical bridges operated by a particular rollup or side-chain.
There is no need for any additional trust assumption on say a 3rd-party oracle or some slow governance mechanism or trusted DAO multisig to ensure that the message is relayed correctly.
As long as there is one honest participant running a working implementation of the light client specifications at any time, and anybody can take on this role.

### Learn more...

##### 🌐 [Website](https://vea.ninja)

##### 📖 [Documentation](https://docs.vea.ninja)

##### 🕵️ [Security disclosures](/SECURITY.md)

## Deployments

##### ⛓️ [Contracts addresses](contracts/README.md#deployed-addresses)

##### ⚖️ [VeaScan explorer](https://veascan.io)

##### 🗃️ Subgraph endpoints

- [Inbox for VeaScan](veascan-subgraph-inbox/README.md#deployments)
- [Outbox for VeaScan](veascan-subgraph-outbox/README.md#deployments)
- [Inbox for the Relayer CLI](relayer-subgraph-inbox/README.md#deployments)

## Content

| Package                                                 | Description                                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **[contracts](/contracts)**                             | Smart contracts of the Vea bridge protocol.                                                                                                   |
| **[relayer-cli](/relayer-cli)**                         | Convenience utility capable of automating the relaying of messages for verified state roots.                                                  |
| **[relayer-subgraph-inbox](/relayer-subgraph-inbox)**   | Indexing of the bridge inbox for relaying purposes, in particular for the computation of the proof of inclusion of a message in a state root. |
| **[services](/services)**                               | Supporting services such as a graph-node container.                                                                                           |
| **[validator-cli](/validator-cli)**                     | Validator implementation in TypeScript capable of fulfilling the roles of Oracle and Challenger.                                              |
| **[veascan-subgraph-inbox](/veascan-subgraph-inbox)**   | Indexing of the bridge inbox for retrieval by the Veascan frontend.                                                                           |
| **[veascan-subgraph-outbox](/veascan-subgraph-outbox)** | Indexing of the bridge outbox for retrieval by the Veascan frontend.                                                                          |
| **[veascan-web](/veascan-web)**                         | Explorer of snapshot and messages crossing the bridge.                                                                                        |
|                                                         |                                                                                                                                               |

## Toolchain:

- Solidity v0.8
- Hardhat
- Ethers v5
- Chai + Mocha
- Node v16
- Typescript
- Yarn v3 without [PlugnPlay](https://yarnpkg.com/getting-started/migration/#switching-to-plugnplay)

## Contributing

### Prerequisites

- Install NodeJS 16:
  - on Red Hat Linux: `sudo dnf module install nodejs:16`
  - on Ubuntu Linux: `sudo snap install node --classic`
  - on MacOS via [brew](https://brew.sh/): `brew install node`
- Install Yarn v1 (Classic): `npm install -g yarn`
  - Then [upgrade](https://yarnpkg.com/getting-started/install#updating-to-the-latest-versions) Yarn to v3: `yarn set version berry`
- Install Volta.sh: `curl https://get.volta.sh | sh`
- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) to run the local graph node.
- Shell utilities: [jq](https://stedolan.github.io/jq/), [yq](https://mikefarah.gitbook.io/yq/)
  - on Red Hat Linux: `sudo dnf install jq yq`
  - on Ubuntu Linux: `sudo snap install jq yq`
  - on MacOS via [brew](https://brew.sh/): `brew install jq yq`

### Install the dependencies

```bash
$ yarn install
```

### [Hardhat CLI auto-completion](https://hardhat.org/guides/shorthand.html) (optional)

```bash
$ npm i -g hardhat-shorthand

$ hardhat-completion install
✔ Which Shell do you use ? · bash
✔ We will install completion to ~/.bashrc, is it ok ? (y/N) · true

$ exec bash
```
