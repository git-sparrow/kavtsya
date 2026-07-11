import { z } from "zod";
import type {
  PushMessage,
  PushProvider,
  PushReceipt,
  PushTicket,
} from "./provider";

/**
 * Raw-fetch implementation of Expo's push HTTP API (#24) — no server SDK, same
 * decision as the Claude provider (ADR 0007): the surface we use is two POST
 * endpoints, and a dependency would outweigh them. Sends are chunked to Expo's
 * documented limit (100 messages per request); an optional access token covers
 * accounts with enhanced push security enabled.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const CHUNK_SIZE = 100;

/** One send response entry: a ticket id, or an immediate per-message error. */
const ticketSchema = z.object({
  status: z.enum(["ok", "error"]),
  id: z.string().optional(),
});
const sendResponseSchema = z.object({ data: z.array(ticketSchema) });

const receiptSchema = z.object({
  status: z.enum(["ok", "error"]),
  details: z.object({ error: z.string().optional() }).optional(),
});
const receiptsResponseSchema = z.object({
  data: z.record(z.string(), receiptSchema),
});

export interface ExpoPushOptions {
  /** Optional Expo access token (enhanced push security). */
  accessToken?: string | undefined;
  fetchImpl?: typeof fetch;
}

export function createExpoPushProvider({
  accessToken,
  fetchImpl = fetch,
}: ExpoPushOptions = {}): PushProvider {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  };

  async function post(url: string, body: unknown): Promise<unknown> {
    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Expo push API ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  return {
    async send(messages: PushMessage[]): Promise<PushTicket[]> {
      const tickets: PushTicket[] = [];
      for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        const chunk = messages.slice(i, i + CHUNK_SIZE);
        const raw = await post(
          EXPO_PUSH_URL,
          chunk.map((m) => ({ to: m.token, body: m.body, sound: "default" })),
        );
        const parsed = sendResponseSchema.parse(raw);
        for (const ticket of parsed.data) {
          tickets.push({
            ticketId: ticket.status === "ok" ? (ticket.id ?? null) : null,
          });
        }
      }
      return tickets;
    },

    async fetchReceipts(
      ticketIds: string[],
    ): Promise<Record<string, PushReceipt>> {
      const receipts: Record<string, PushReceipt> = {};
      for (let i = 0; i < ticketIds.length; i += CHUNK_SIZE) {
        const chunk = ticketIds.slice(i, i + CHUNK_SIZE);
        const raw = await post(EXPO_RECEIPTS_URL, { ids: chunk });
        const parsed = receiptsResponseSchema.parse(raw);
        for (const [id, receipt] of Object.entries(parsed.data)) {
          receipts[id] =
            receipt.status === "ok"
              ? { status: "ok" }
              : { status: "error", error: receipt.details?.error };
        }
      }
      return receipts;
    },
  };
}
