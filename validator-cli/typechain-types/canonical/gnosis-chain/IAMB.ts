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

export interface IAMBInterface extends utils.Interface {
  functions: {
    "maxGasPerTx()": FunctionFragment;
    "messageSender()": FunctionFragment;
    "messageSourceChainId()": FunctionFragment;
    "requireToPassMessage(address,bytes,uint256)": FunctionFragment;
  };

  getFunction(
    nameOrSignatureOrTopic: "maxGasPerTx" | "messageSender" | "messageSourceChainId" | "requireToPassMessage"
  ): FunctionFragment;

  encodeFunctionData(functionFragment: "maxGasPerTx", values?: undefined): string;
  encodeFunctionData(functionFragment: "messageSender", values?: undefined): string;
  encodeFunctionData(functionFragment: "messageSourceChainId", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "requireToPassMessage",
    values: [PromiseOrValue<string>, PromiseOrValue<BytesLike>, PromiseOrValue<BigNumberish>]
  ): string;

  decodeFunctionResult(functionFragment: "maxGasPerTx", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "messageSender", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "messageSourceChainId", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "requireToPassMessage", data: BytesLike): Result;

  events: {};
}

export interface IAMB extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: IAMBInterface;

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
    maxGasPerTx(overrides?: CallOverrides): Promise<[BigNumber]>;

    messageSender(overrides?: CallOverrides): Promise<[string]>;

    messageSourceChainId(overrides?: CallOverrides): Promise<[string]>;

    requireToPassMessage(
      _contract: PromiseOrValue<string>,
      _data: PromiseOrValue<BytesLike>,
      _gas: PromiseOrValue<BigNumberish>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;
  };

  maxGasPerTx(overrides?: CallOverrides): Promise<BigNumber>;

  messageSender(overrides?: CallOverrides): Promise<string>;

  messageSourceChainId(overrides?: CallOverrides): Promise<string>;

  requireToPassMessage(
    _contract: PromiseOrValue<string>,
    _data: PromiseOrValue<BytesLike>,
    _gas: PromiseOrValue<BigNumberish>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  callStatic: {
    maxGasPerTx(overrides?: CallOverrides): Promise<BigNumber>;

    messageSender(overrides?: CallOverrides): Promise<string>;

    messageSourceChainId(overrides?: CallOverrides): Promise<string>;

    requireToPassMessage(
      _contract: PromiseOrValue<string>,
      _data: PromiseOrValue<BytesLike>,
      _gas: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<string>;
  };

  filters: {};

  estimateGas: {
    maxGasPerTx(overrides?: CallOverrides): Promise<BigNumber>;

    messageSender(overrides?: CallOverrides): Promise<BigNumber>;

    messageSourceChainId(overrides?: CallOverrides): Promise<BigNumber>;

    requireToPassMessage(
      _contract: PromiseOrValue<string>,
      _data: PromiseOrValue<BytesLike>,
      _gas: PromiseOrValue<BigNumberish>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    maxGasPerTx(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    messageSender(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    messageSourceChainId(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    requireToPassMessage(
      _contract: PromiseOrValue<string>,
      _data: PromiseOrValue<BytesLike>,
      _gas: PromiseOrValue<BigNumberish>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;
  };
}