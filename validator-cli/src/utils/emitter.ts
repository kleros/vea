import { EventEmitter } from "node:events";
import { BotEvents } from "./botEvents";

export const defaultEmitter = new EventEmitter();

export class MockEmitter extends EventEmitter {
  emit(event: string | symbol, ...args: any[]): boolean {
    // Prevent console logs for BotEvents during tests
    if (Object.values(BotEvents).includes(event as BotEvents)) {
      return true;
    }
    return super.emit(event, ...args);
  }
}
