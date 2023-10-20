/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumber,
  BigNumberish,
  BytesLike,
  CallOverrides,
  ContractTransaction,
  Overrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type { TypedEventFilter, TypedEvent, TypedListener, OnEvent, PromiseOrValue } from "../../common";

export interface SenderGatewayMockInterface extends utils.Interface {
  functions: {
    "receiverGateway()": FunctionFragment;
    "sendMessage(uint256)": FunctionFragment;
    "veaInbox()": FunctionFragment;
  };

  getFunction(nameOrSignatureOrTopic: "receiverGateway" | "sendMessage" | "veaInbox"): FunctionFragment;

  encodeFunctionData(functionFragment: "receiverGateway", values?: undefined): string;
  encodeFunctionData(functionFragment: "sendMessage", values: [PromiseOrValue<BigNumberish>]): string;
  encodeFunctionData(functionFragment: "veaInbox", values?: undefined): string;

  decodeFunctionResult(functionFragment: "receiverGateway", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "sendMessage", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "veaInbox", data: BytesLike): Result;

  events: {};
}

export interface SenderGatewayMock extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: SenderGatewayMockInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(eventFilter?: TypedEventFilter<TEvent>): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(eventFilter: TypedEventFilter<TEvent>): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    receiverGateway(overrides?: CallOverrides): Promise<[string]>;

    sendMessage(
      _data: PromiseOrValue<BigNumberish>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    veaInbox(overrides?: CallOverrides): Promise<[string]>;
  };

  receiverGateway(overrides?: CallOverrides): Promise<string>;

  sendMessage(
    _data: PromiseOrValue<BigNumberish>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  veaInbox(overrides?: CallOverrides): Promise<string>;

  callStatic: {
    receiverGateway(overrides?: CallOverrides): Promise<string>;

    sendMessage(_data: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<void>;

    veaInbox(overrides?: CallOverrides): Promise<string>;
  };

  filters: {};

  estimateGas: {
    receiverGateway(overrides?: CallOverrides): Promise<BigNumber>;

    sendMessage(
      _data: PromiseOrValue<BigNumberish>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    veaInbox(overrides?: CallOverrides): Promise<BigNumber>;
  };

  populateTransaction: {
    receiverGateway(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    sendMessage(
      _data: PromiseOrValue<BigNumberish>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    veaInbox(overrides?: CallOverrides): Promise<PopulatedTransaction>;
  };
}