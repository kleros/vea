/**
 * Signed sends for the transaction handler tests: what ethers reports for a transaction it just
 * broadcast, signed with a throwaway key, together with its signed bytes. A handler keeps those
 * bytes and re-broadcasts them, unchanged, while the transaction is stuck.
 */
import { Transaction, Wallet } from "ethers";
import { Wallet as WalletV5 } from "@ethersproject/wallet";
import { parse } from "@ethersproject/transactions";
import { BigNumber } from "@ethersproject/bignumber";

const KEY = "0x" + "11".repeat(32);

/** The address the test key signs for. */
export const TEST_SIGNER = new Wallet(KEY).address;

const GWEI = BigInt(1_000_000_000);

export interface SendFields {
  nonce: number;
  chainId?: number;
  to?: string;
  data?: string;
  value?: bigint;
  gasLimit?: bigint;
  /** EIP-1559 fees, 40 / 2 gwei unless set; a `gasPrice` makes it a legacy transaction instead. */
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
}

const requestOf = ({ gasPrice, maxFeePerGas, maxPriorityFeePerGas, ...fields }: SendFields) => ({
  chainId: 11155111,
  to: "0x00000000000000000000000000000000000000b0",
  data: "0xc0ffee",
  value: BigInt(0),
  gasLimit: BigInt(100_000),
  ...fields,
  ...(gasPrice !== undefined
    ? { type: 0, gasPrice }
    : {
        type: 2,
        maxFeePerGas: maxFeePerGas ?? BigInt(40) * GWEI,
        maxPriorityFeePerGas: maxPriorityFeePerGas ?? BigInt(2) * GWEI,
      }),
});

/** A send as an ethers v6 contract call reports it (its fields and `signature`), and its signed bytes. */
export const signedSend = async (fields: SendFields) => {
  const raw = await new Wallet(KEY).signTransaction(requestOf(fields));
  const tx = Transaction.from(raw);
  const response = {
    hash: tx.hash,
    type: tx.type,
    chainId: tx.chainId,
    nonce: tx.nonce,
    gasLimit: tx.gasLimit,
    gasPrice: tx.gasPrice,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    to: tx.to,
    from: tx.from,
    value: tx.value,
    data: tx.data,
    accessList: tx.accessList,
    signature: tx.signature,
  };
  return { raw, response };
};

/**
 * A send as ethers v5 reports it (the `ContractTransaction` of `messageExecutor`): BigNumber
 * amounts, no type on a legacy one, and the signature as `r`, `s` and `v`. Its signed bytes too.
 */
export const signedSendV5 = async (fields: SendFields) => {
  const request = requestOf(fields);
  const bigNumbers = Object.fromEntries(
    Object.entries(request).map(([key, value]) => [
      key,
      typeof value === "bigint" ? BigNumber.from(value.toString()) : value,
    ])
  );
  const raw = await new WalletV5(KEY).signTransaction({
    ...bigNumbers,
    type: request.type === 0 ? undefined : request.type,
  });
  return { raw, response: { ...parse(raw), confirmations: 0 } };
};

/** The fees a signed transaction pays: what a test compares with the original's. */
export const feesOf = (raw: string) => {
  const tx = Transaction.from(raw);
  return {
    nonce: tx.nonce,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    gasPrice: tx.type === 0 ? tx.gasPrice : null,
  };
};
