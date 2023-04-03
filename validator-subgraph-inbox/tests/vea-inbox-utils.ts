import { newMockEvent } from "matchstick-as";
import { ethereum, Bytes, BigInt } from "@graphprotocol/graph-ts";
import { MessageSent, SnapshotSaved, StaterootSent } from "../generated/VeaInbox/VeaInbox";

export function createMessageSentEvent(msgData: Bytes): MessageSent {
  let messageSentEvent = changetype<MessageSent>(newMockEvent());

  messageSentEvent.parameters = new Array();

  messageSentEvent.parameters.push(new ethereum.EventParam("msgData", ethereum.Value.fromBytes(msgData)));

  return messageSentEvent;
}

export function createSnapshotSavedEvent(epoch: BigInt, stateRoot: Bytes): SnapshotSaved {
  let snapshotSavedEvent = changetype<SnapshotSaved>(newMockEvent());

  snapshotSavedEvent.parameters = new Array();

  snapshotSavedEvent.parameters.push(new ethereum.EventParam("epoch", ethereum.Value.fromUnsignedBigInt(epoch)));
  snapshotSavedEvent.parameters.push(new ethereum.EventParam("stateRoot", ethereum.Value.fromFixedBytes(stateRoot)));

  return snapshotSavedEvent;
}

export function createStaterootSentEvent(epoch: BigInt, stateRoot: Bytes): StaterootSent {
  let staterootSentEvent = changetype<StaterootSent>(newMockEvent());

  staterootSentEvent.parameters = new Array();

  staterootSentEvent.parameters.push(new ethereum.EventParam("epoch", ethereum.Value.fromUnsignedBigInt(epoch)));
  staterootSentEvent.parameters.push(new ethereum.EventParam("stateRoot", ethereum.Value.fromFixedBytes(stateRoot)));

  return staterootSentEvent;
}
