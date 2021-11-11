<p align="center">
  <a href="https://kleros.io">
    <img alt="Kleros" src="https://github.com/kleros/court/blob/master/public/icon-512.png?raw=true" width="128">
  </a>
</p>

<p align="center">
  <b style="font-size: 32px;">Kleros v2</b>
</p>

<p align="center">
  <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg" alt="Conventional Commits"></a>
  <a href="http://commitizen.github.io/cz-cli/"><img src="https://img.shields.io/badge/commitizen-friendly-brightgreen.svg" alt="Commitizen Friendly"></a>
  <a href="https://github.com/prettier/prettier"><img src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg" alt="Styled with Prettier"></a>
</p>

---

## Toolchain:

- Solidity 0.8
- Hardhat
- Ethers
- Waffle
- Typescript
- Node 16
- Yarn 3 without [PlugnPlay](https://yarnpkg.com/getting-started/migration/#switching-to-plugnplay)

## Contributing

### Pre-Requisites

- Install NodeJS 16:
  - on Red Hat Linux: `dnf module install nodejs:16`
  - on Ubuntu Linux: `sudo snap install node --classic`
  - on MacOS via [brew](https://brew.sh/): `brew install node`
  - on Windows via [Chocolatey](https://chocolatey.org/): `choco install nvs`
- Install Yarn v1.22: `npm install -g yarn`
- [Upgrade](https://yarnpkg.com/getting-started/install#updating-to-the-latest-versions) Yarn to v3: `yarn set version berry`

### Optional Steps

#### [Hardhat CLI auto-completion](https://hardhat.org/guides/shorthand.html)

```bash
$ npm i -g hardhat-shorthand

$ hardhat-completion install
✔ Which Shell do you use ? · bash
✔ We will install completion to ~/.bashrc, is it ok ? (y/N) · true

$ . ~/.bashrc
```

### Getting Started

#### Install the dependencies

```bash
$ yarn install
```

## Repo Structure

Each directory at the root of this repository contains code for each individual part that enables this integration:

- **`bots/`**: service to automate some steps of the flow which otherwise would required manual intervention from users.
  - **Notice:** while this is a centralized service, it exists only for convenience. Anyone can fulfill the role of the bots if they wish to do so.
- **`contracts/`**: Smart contracts running the arbitration system [Learn more](contracts/README.md).
- **`dynamic-script/`**: allows fetching the dynamic content for the arbitration, as described by [ERC-1497: Evidence Standard](https://github.com/ethereum/EIPs/issues/1497).
- **`evidence-display/`**: display interface that should be used to render the evidence for arbitrators, as described by [ERC-1497: Evidence Standard](https://github.com/ethereum/EIPs/issues/1497).

## Deployment

See [contracts/README.md](contracts/README.md#deployed-addresses).
