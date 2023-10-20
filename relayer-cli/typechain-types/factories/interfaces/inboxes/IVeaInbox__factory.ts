/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Signer, utils } from "ethers";
import type { Provider } from "@ethersproject/providers";
import type { IVeaInbox, IVeaInboxInterface } from "../../../interfaces/inboxes/IVeaInbox";

const _abi = [
  {
    inputs: [],
    name: "saveSnapshot",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_to",
        type: "address",
      },
      {
        internalType: "bytes4",
        name: "_fnSelection",
        type: "bytes4",
      },
      {
        internalType: "bytes",
        name: "_data",
        type: "bytes",
      },
    ],
    name: "sendMessage",
    outputs: [
      {
        internalType: "uint64",
        name: "msgId",
        type: "uint64",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export class IVeaInbox__factory {
  static readonly abi = _abi;
  static createInterface(): IVeaInboxInterface {
    return new utils.Interface(_abi) as IVeaInboxInterface;
  }
  static connect(address: string, signerOrProvider: Signer | Provider): IVeaInbox {
    return new Contract(address, _abi, signerOrProvider) as IVeaInbox;
  }
}
