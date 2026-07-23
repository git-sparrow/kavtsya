import { useRef, useState } from "react";

import type {
  PurchaseResult,
  RedemptionResult,
  ScanRejection,
} from "@kavtsya/shared";

import {
  confirmRedemption as confirmRedemptionRequest,
  issuePurchase,
  issuePurchaseByMemberCode,
  ScanRejectionError,
} from "@/lib/api";

export type ScanState =
  | { phase: "scanning" }
  | { phase: "sending" }
  | { phase: "issued"; result: PurchaseResult; confirmError?: string }
  | { phase: "confirming"; result: PurchaseResult }
  | {
      phase: "redeemed";
      result: PurchaseResult;
      redemption: RedemptionResult;
      confirmError?: string;
    }
  // `code` is the #50 taxonomy reason when the API named one (keys the two-line
  // recovery copy, 2f); null for a transport failure the barista can only retry.
  | { phase: "rejected"; code: ScanRejection | null; message: string };

/**
 * The scan screen's state machine (#20, #22): one recognised QR fires one
 * `POST /api/purchases`, then the screen holds the outcome until the CafeOwner
 * taps "scan next". The camera keeps emitting the same barcode many times a
 * second, so an in-flight ref (not just state, which updates async) gates the
 * request — the server's single-use `jti` is the real guarantee; this just
 * avoids pointless duplicate calls.
 *
 * Off the held outcome the CafeOwner can also confirm a Redemption (#22) — a
 * distinct action, no second scan. Banking works by confirming again while the
 * balance still covers the threshold.
 *
 * The typed member code (#21) enters the same machine through the same gate:
 * one manual submission behaves exactly like one recognised QR, so the
 * counter flow is one habit, not two.
 */
export function useScanPurchase(cafeId: string) {
  const [state, setState] = useState<ScanState>({ phase: "scanning" });
  const inFlight = useRef(false);
  // The current confirm attempt's idempotency key: kept across a failed tap so
  // the retry replays server-side instead of spending twice, cleared on
  // success so the next confirm (banking) is a genuine new spend.
  const confirmKey = useRef<string | null>(null);

  async function send(request: () => Promise<PurchaseResult>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ phase: "sending" });
    try {
      const result = await request();
      setState({ phase: "issued", result });
    } catch (e) {
      setState({
        phase: "rejected",
        code: e instanceof ScanRejectionError ? e.code : null,
        message:
          e instanceof Error ? e.message : "Не вдалося нарахувати зернятко",
      });
    }
  }

  function onScanned(qrToken: string) {
    return send(() => issuePurchase(cafeId, qrToken));
  }

  /** The offline fallback (#21): the code is already normalized and well-formed. */
  function onMemberCode(memberCode: string) {
    return send(() => issuePurchaseByMemberCode(cafeId, memberCode));
  }

  async function confirmRedemption() {
    if (state.phase !== "issued" && state.phase !== "redeemed") return;
    const before = state;
    // Uniqueness is all the key needs (it guards a retry, not a secret), so
    // no crypto dependency: the clock plus two random suffixes.
    confirmKey.current ??= `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    setState({ phase: "confirming", result: before.result });
    try {
      const redemption = await confirmRedemptionRequest(
        cafeId,
        before.result.customerId,
        confirmKey.current,
      );
      confirmKey.current = null;
      setState({
        phase: "redeemed",
        result: { ...before.result, balance: redemption.balance },
        redemption,
      });
    } catch (e) {
      setState({
        ...before,
        confirmError:
          e instanceof Error ? e.message : "Не вдалося видати винагороду",
      });
    }
  }

  function scanNext() {
    inFlight.current = false;
    confirmKey.current = null;
    setState({ phase: "scanning" });
  }

  return { state, onScanned, onMemberCode, confirmRedemption, scanNext };
}
