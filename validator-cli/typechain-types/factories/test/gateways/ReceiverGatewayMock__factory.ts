/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import type { Provider, TransactionRequest } from "@ethersproject/providers";
import type { PromiseOrValue } from "../../../common";
import type { ReceiverGatewayMock, ReceiverGatewayMockInterface } from "../../../test/gateways/ReceiverGatewayMock";

const _abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_veaOutbox",
        type: "address",
      },
      {
        internalType: "address",
        name: "_senderGateway",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "data",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "messageCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "messageSender",
        type: "address",
      },
    ],
    name: "receiveMessage",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "messageSender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_data",
        type: "uint256",
      },
    ],
    name: "receiveMessage",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "senderGateway",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "veaOutbox",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const _bytecode =
  "0x60c060405234801561001057600080fd5b506040516104be3803806104be83398101604081905261002f91610062565b6001600160a01b039182166080521660a052610095565b80516001600160a01b038116811461005d57600080fd5b919050565b6000806040838503121561007557600080fd5b61007e83610046565b915061008c60208401610046565b90509250929050565b60805160a0516103ea6100d46000396000818160b90152818161018d015261025601526000818160f80152818161011d01526101eb01526103ea6000f3fe608060405234801561001057600080fd5b50600436106100625760003560e01c80633dbcc8d11461006757806373d4a13a146100835780637596c3dd1461008c5780639e28b674146100a1578063ce0aaf95146100b4578063dea580b9146100f3575b600080fd5b61007060005481565b6040519081526020015b60405180910390f35b61007060015481565b61009f61009a3660046102fe565b61011a565b005b61009f6100af366004610320565b6101e8565b6100db7f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b03909116815260200161007a565b6100db7f000000000000000000000000000000000000000000000000000000000000000081565b807f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316331461018b5760405162461bcd60e51b815260206004820152601060248201526f2b32b090213934b233b29037b7363c9760811b60448201526064015b60405180910390fd5b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316816001600160a01b0316146101dc5760405162461bcd60e51b81526004016101829061034a565b6101e46102b3565b5050565b817f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031633146102545760405162461bcd60e51b815260206004820152601060248201526f2b32b090213934b233b29037b7363c9760811b6044820152606401610182565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316816001600160a01b0316146102a55760405162461bcd60e51b81526004016101829061034a565b6102ae826102c9565b505050565b6000805490806102c28361038d565b9190505550565b6000805490806102d88361038d565b9091555050600155565b80356001600160a01b03811681146102f957600080fd5b919050565b60006020828403121561031057600080fd5b610319826102e2565b9392505050565b6000806040838503121561033357600080fd5b61033c836102e2565b946020939093013593505050565b60208082526023908201527f4f6e6c79207468652073656e646572206761746577617920697320616c6c6f7760408201526232b21760e91b606082015260800190565b6000600182016103ad57634e487b7160e01b600052601160045260246000fd5b506001019056fea2646970667358221220e28323f7a12ef838d615e138d4c194b7a1e24ca6be6782f3dc7f7f163c60ce8b64736f6c63430008120033";

type ReceiverGatewayMockConstructorParams = [signer?: Signer] | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (xs: ReceiverGatewayMockConstructorParams): xs is ConstructorParameters<typeof ContractFactory> =>
  xs.length > 1;

export class ReceiverGatewayMock__factory extends ContractFactory {
  constructor(...args: ReceiverGatewayMockConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  override deploy(
    _veaOutbox: PromiseOrValue<string>,
    _senderGateway: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ReceiverGatewayMock> {
    return super.deploy(_veaOutbox, _senderGateway, overrides || {}) as Promise<ReceiverGatewayMock>;
  }
  override getDeployTransaction(
    _veaOutbox: PromiseOrValue<string>,
    _senderGateway: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(_veaOutbox, _senderGateway, overrides || {});
  }
  override attach(address: string): ReceiverGatewayMock {
    return super.attach(address) as ReceiverGatewayMock;
  }
  override connect(signer: Signer): ReceiverGatewayMock__factory {
    return super.connect(signer) as ReceiverGatewayMock__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): ReceiverGatewayMockInterface {
    return new utils.Interface(_abi) as ReceiverGatewayMockInterface;
  }
  static connect(address: string, signerOrProvider: Signer | Provider): ReceiverGatewayMock {
    return new Contract(address, _abi, signerOrProvider) as ReceiverGatewayMock;
  }
}