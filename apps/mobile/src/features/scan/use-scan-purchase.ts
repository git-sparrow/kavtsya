import { useRef, useState } from "react";

import type { PurchaseResult } from "@kavtsya/shared";

import { issuePurchase } from "@/lib/api";

export type ScanState =
  | { phase: "scanning" }
  | { phase: "sending" }
  | { phase: "issued"; result: PurchaseResult }
  | { phase: "rejected"; message: string };

/**
 * The scan screen's state machine (#20): one recognised QR fires one
 * `POST /api/purchases`, then the screen holds the outcome until the CafeOwner
 * taps "scan next". The camera keeps emitting the same barcode many times a
 * second, so an in-flight ref (not just state, which updates async) gates the
 * request — the server's single-use `jti` is the real guarantee; this just
 * avoids pointless duplicate calls.
 */
export function useScanPurchase(cafeId: string) {
  const [state, setState] = useState<ScanState>({ phase: "scanning" });
  const inFlight = useRef(false);

  async function onScanned(qrToken: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ phase: "sending" });
    try {
      const result = await issuePurchase(cafeId, qrToken);
      setState({ phase: "issued", result });
    } catch (e) {
      setState({
        phase: "rejected",
        message:
          e instanceof Error ? e.message : "Не вдалося нарахувати зернятко",
      });
    }
  }

  function scanNext() {
    inFlight.current = false;
    setState({ phase: "scanning" });
  }

  return { state, onScanned, scanNext };
}
