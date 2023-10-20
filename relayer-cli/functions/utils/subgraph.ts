import { GraphQLClient } from "graphql-request";
import { arbitrumGoerli, goerli, gnosisChiado } from "viem/chains";
import {
  GetCountQuery,
  GetMsgDataQuery,
  GetProofQuery,
  GetNonceFromQuery,
  Sdk,
  getSdk,
} from "../../generated/vea-inbox";

import { Supported } from "../../types";

const subgraphInboxArbGoerliFrom = {
  [arbitrumGoerli.id]: "https://api.thegraph.com/subgraphs/name/shotaronowhere/vea-inbox-arbgoerli-to-goerli",
  [gnosisChiado.id]: "https://api.thegraph.com/subgraphs/name/shotaronowhere/vea-inbox-arbgoerli-to-chiado",
} as const;

export const sdksInboxArbGoerliFrom = Object.entries(subgraphInboxArbGoerliFrom).reduce((acc, [chainId, url]) => {
  return {
    ...acc,
    [+chainId]: getSdk(new GraphQLClient(url)),
  };
}, {} as Record<Supported<(keyof typeof subgraphInboxArbGoerliFrom)[]>, Sdk>);

export const supportedChainIdsInbox = [arbitrumGoerli.id];

export const supportedChainIdsOutbox = [gnosisChiado.id, goerli.id];

require("dotenv").config();
const {
  RPC_URL_CHIADO,
  RPC_URL_GOERLI,
  RPC_URL_ARB_GOERLI,
  VEAOUTBOX_ARBGOERLI_TO_GOERLI_ADDRESS,
  VEAOUTBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
} = process.env;

export const rpcUrlInbox = {
  [arbitrumGoerli.id]: RPC_URL_ARB_GOERLI,
};

export const rpcUrlOutbox = {
  [gnosisChiado.id]: RPC_URL_CHIADO,
  [goerli.id]: RPC_URL_GOERLI,
};

export const veaOutboxFromArbGoerliTo = {
  [gnosisChiado.id]: VEAOUTBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
  [goerli.id]: VEAOUTBOX_ARBGOERLI_TO_GOERLI_ADDRESS,
};

export const getInboxCount = async (chainId: Supported<typeof supportedChainIdsOutbox>, params: { stateRoot: any }) => {
  let res: GetCountQuery | undefined = undefined;
  try {
    res = await sdksInboxArbGoerliFrom[chainId as Supported<(keyof typeof subgraphInboxArbGoerliFrom)[]>]["GetCount"](
      params
    );
  } catch (e) {
    console.error(e);
  }
  return res;
};

export const getInboxMsgData = async (
  chainId: Supported<typeof supportedChainIdsOutbox>,
  params: { nonce: number[] }
) => {
  let res: GetMsgDataQuery | undefined = undefined;
  try {
    res = await sdksInboxArbGoerliFrom[chainId as Supported<(keyof typeof subgraphInboxArbGoerliFrom)[]>]["GetMsgData"](
      params
    );
  } catch (e) {
    console.error(e);
  }
  return res;
};

export const getInboxNonceFromSender = async (
  chainId: Supported<typeof supportedChainIdsOutbox>,
  params: { nonce: any; msgSender: any }
) => {
  let res: GetNonceFromQuery | undefined = undefined;
  try {
    res = await sdksInboxArbGoerliFrom[chainId as Supported<(keyof typeof subgraphInboxArbGoerliFrom)[]>][
      "GetNonceFrom"
    ](params);
  } catch (e) {
    console.error(e);
  }
  return res;
};

export const getProof = async (
  chainId: Supported<typeof supportedChainIdsOutbox>,
  params: { proofIndices: string | string[] }
) => {
  let res: GetProofQuery | undefined = undefined;
  try {
    res = await sdksInboxArbGoerliFrom[chainId as Supported<(keyof typeof subgraphInboxArbGoerliFrom)[]>]["GetProof"](
      params
    );
  } catch (e) {
    console.error(e);
  }
  return res;
};
