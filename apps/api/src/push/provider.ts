/**
 * The PushProvider abstraction (#24), modeled on the AIProvider seam
 * (ADR 0007): everything in the codebase depends on this interface, tests
 * substitute a fake and never send a real notification, and swapping the
 * transport is an env change (see `createPushProvider`).
 *
 * Two methods because Expo push is two-phase: a send returns TICKETS
 * immediately, and RECEIPTS — including the `DeviceNotRegistered` verdicts
 * that drive token pruning — arrive asynchronously (~15 min) and are fetched
 * by the receipts script.
 */

export interface PushMessage {
  /** The device's Expo push token. */
  token: string;
  /** The notification body — the campaign message. */
  body: string;
}

/**
 * One ticket per message, aligned with the send's input order. `ticketId` is
 * null when the transport rejected that message outright (no receipt will
 * ever exist for it).
 */
export interface PushTicket {
  ticketId: string | null;
}

export type PushReceipt =
  | { status: "ok" }
  | {
      status: "error";
      /** Expo's error code — `DeviceNotRegistered` is the one that prunes tokens. */
      error?: string;
    };

export interface PushProvider {
  /** Deliver the messages; returns one ticket per message, same order. */
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  /** Resolve receipts for ticket ids; absent ids are simply not ready yet. */
  fetchReceipts(ticketIds: string[]): Promise<Record<string, PushReceipt>>;
}
