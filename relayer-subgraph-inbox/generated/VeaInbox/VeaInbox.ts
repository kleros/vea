// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import {
  ethereum,
  JSONValue,
  TypedMap,
  Entity,
  Bytes,
  Address,
  BigInt,
} from "@graphprotocol/graph-ts";

export class MessageSent extends ethereum.Event {
  get params(): MessageSent__Params {
    return new MessageSent__Params(this);
  }
}

export class MessageSent__Params {
  _event: MessageSent;

  constructor(event: MessageSent) {
    this._event = event;
  }

  get _nodeData(): Bytes {
    return this._event.parameters[0].value.toBytes();
  }
}

export class SnapshotSaved extends ethereum.Event {
  get params(): SnapshotSaved__Params {
    return new SnapshotSaved__Params(this);
  }
}

export class SnapshotSaved__Params {
  _event: SnapshotSaved;

  constructor(event: SnapshotSaved) {
    this._event = event;
  }

  get _snapshot(): Bytes {
    return this._event.parameters[0].value.toBytes();
  }

  get _epoch(): BigInt {
    return this._event.parameters[1].value.toBigInt();
  }

  get _count(): BigInt {
    return this._event.parameters[2].value.toBigInt();
  }
}

export class SnapshotSent extends ethereum.Event {
  get params(): SnapshotSent__Params {
    return new SnapshotSent__Params(this);
  }
}

export class SnapshotSent__Params {
  _event: SnapshotSent;

  constructor(event: SnapshotSent) {
    this._event = event;
  }

  get _epochSent(): BigInt {
    return this._event.parameters[0].value.toBigInt();
  }

  get _ticketId(): Bytes {
    return this._event.parameters[1].value.toBytes();
  }
}

export class VeaInbox extends ethereum.SmartContract {
  static bind(address: Address): VeaInbox {
    return new VeaInbox("VeaInbox", address);
  }

  count(): BigInt {
    let result = super.call("count", "count():(uint64)", []);

    return result[0].toBigInt();
  }

  try_count(): ethereum.CallResult<BigInt> {
    let result = super.tryCall("count", "count():(uint64)", []);
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  epochAt(_timestamp: BigInt): BigInt {
    let result = super.call("epochAt", "epochAt(uint256):(uint256)", [
      ethereum.Value.fromUnsignedBigInt(_timestamp),
    ]);

    return result[0].toBigInt();
  }

  try_epochAt(_timestamp: BigInt): ethereum.CallResult<BigInt> {
    let result = super.tryCall("epochAt", "epochAt(uint256):(uint256)", [
      ethereum.Value.fromUnsignedBigInt(_timestamp),
    ]);
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  epochFinalized(): BigInt {
    let result = super.call("epochFinalized", "epochFinalized():(uint256)", []);

    return result[0].toBigInt();
  }

  try_epochFinalized(): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "epochFinalized",
      "epochFinalized():(uint256)",
      []
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  epochNow(): BigInt {
    let result = super.call("epochNow", "epochNow():(uint256)", []);

    return result[0].toBigInt();
  }

  try_epochNow(): ethereum.CallResult<BigInt> {
    let result = super.tryCall("epochNow", "epochNow():(uint256)", []);
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  epochPeriod(): BigInt {
    let result = super.call("epochPeriod", "epochPeriod():(uint256)", []);

    return result[0].toBigInt();
  }

  try_epochPeriod(): ethereum.CallResult<BigInt> {
    let result = super.tryCall("epochPeriod", "epochPeriod():(uint256)", []);
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  sendMessage(_to: Address, _fnSelector: Bytes, _data: Bytes): BigInt {
    let result = super.call(
      "sendMessage",
      "sendMessage(address,bytes4,bytes):(uint64)",
      [
        ethereum.Value.fromAddress(_to),
        ethereum.Value.fromFixedBytes(_fnSelector),
        ethereum.Value.fromBytes(_data),
      ]
    );

    return result[0].toBigInt();
  }

  try_sendMessage(
    _to: Address,
    _fnSelector: Bytes,
    _data: Bytes
  ): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "sendMessage",
      "sendMessage(address,bytes4,bytes):(uint64)",
      [
        ethereum.Value.fromAddress(_to),
        ethereum.Value.fromFixedBytes(_fnSelector),
        ethereum.Value.fromBytes(_data),
      ]
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }

  snapshots(param0: BigInt): Bytes {
    let result = super.call("snapshots", "snapshots(uint256):(bytes32)", [
      ethereum.Value.fromUnsignedBigInt(param0),
    ]);

    return result[0].toBytes();
  }

  try_snapshots(param0: BigInt): ethereum.CallResult<Bytes> {
    let result = super.tryCall("snapshots", "snapshots(uint256):(bytes32)", [
      ethereum.Value.fromUnsignedBigInt(param0),
    ]);
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBytes());
  }

  veaOutboxArbToEth(): Address {
    let result = super.call(
      "veaOutboxArbToEth",
      "veaOutboxArbToEth():(address)",
      []
    );

    return result[0].toAddress();
  }

  try_veaOutboxArbToEth(): ethereum.CallResult<Address> {
    let result = super.tryCall(
      "veaOutboxArbToEth",
      "veaOutboxArbToEth():(address)",
      []
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toAddress());
  }
}

export class ConstructorCall extends ethereum.Call {
  get inputs(): ConstructorCall__Inputs {
    return new ConstructorCall__Inputs(this);
  }

  get outputs(): ConstructorCall__Outputs {
    return new ConstructorCall__Outputs(this);
  }
}

export class ConstructorCall__Inputs {
  _call: ConstructorCall;

  constructor(call: ConstructorCall) {
    this._call = call;
  }

  get _epochPeriod(): BigInt {
    return this._call.inputValues[0].value.toBigInt();
  }

  get _veaOutboxArbToEth(): Address {
    return this._call.inputValues[1].value.toAddress();
  }
}

export class ConstructorCall__Outputs {
  _call: ConstructorCall;

  constructor(call: ConstructorCall) {
    this._call = call;
  }
}

export class SaveSnapshotCall extends ethereum.Call {
  get inputs(): SaveSnapshotCall__Inputs {
    return new SaveSnapshotCall__Inputs(this);
  }

  get outputs(): SaveSnapshotCall__Outputs {
    return new SaveSnapshotCall__Outputs(this);
  }
}

export class SaveSnapshotCall__Inputs {
  _call: SaveSnapshotCall;

  constructor(call: SaveSnapshotCall) {
    this._call = call;
  }
}

export class SaveSnapshotCall__Outputs {
  _call: SaveSnapshotCall;

  constructor(call: SaveSnapshotCall) {
    this._call = call;
  }
}

export class SendMessageCall extends ethereum.Call {
  get inputs(): SendMessageCall__Inputs {
    return new SendMessageCall__Inputs(this);
  }

  get outputs(): SendMessageCall__Outputs {
    return new SendMessageCall__Outputs(this);
  }
}

export class SendMessageCall__Inputs {
  _call: SendMessageCall;

  constructor(call: SendMessageCall) {
    this._call = call;
  }

  get _to(): Address {
    return this._call.inputValues[0].value.toAddress();
  }

  get _fnSelector(): Bytes {
    return this._call.inputValues[1].value.toBytes();
  }

  get _data(): Bytes {
    return this._call.inputValues[2].value.toBytes();
  }
}

export class SendMessageCall__Outputs {
  _call: SendMessageCall;

  constructor(call: SendMessageCall) {
    this._call = call;
  }

  get value0(): BigInt {
    return this._call.outputValues[0].value.toBigInt();
  }
}

export class SendSnapshotCall extends ethereum.Call {
  get inputs(): SendSnapshotCall__Inputs {
    return new SendSnapshotCall__Inputs(this);
  }

  get outputs(): SendSnapshotCall__Outputs {
    return new SendSnapshotCall__Outputs(this);
  }
}

export class SendSnapshotCall__Inputs {
  _call: SendSnapshotCall;

  constructor(call: SendSnapshotCall) {
    this._call = call;
  }

  get _epoch(): BigInt {
    return this._call.inputValues[0].value.toBigInt();
  }

  get _claim(): SendSnapshotCall_claimStruct {
    return changetype<SendSnapshotCall_claimStruct>(
      this._call.inputValues[1].value.toTuple()
    );
  }
}

export class SendSnapshotCall__Outputs {
  _call: SendSnapshotCall;

  constructor(call: SendSnapshotCall) {
    this._call = call;
  }
}

export class SendSnapshotCall_claimStruct extends ethereum.Tuple {
  get stateRoot(): Bytes {
    return this[0].toBytes();
  }

  get claimer(): Address {
    return this[1].toAddress();
  }

  get timestampClaimed(): BigInt {
    return this[2].toBigInt();
  }

  get timestampVerification(): BigInt {
    return this[3].toBigInt();
  }

  get blocknumberVerification(): BigInt {
    return this[4].toBigInt();
  }

  get honest(): i32 {
    return this[5].toI32();
  }

  get challenger(): Address {
    return this[6].toAddress();
  }
}
