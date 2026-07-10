import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

import { fetchMemberCode } from "@/lib/api";

/** Where the code lives on the device — same store as the session cookie. */
const STORAGE_KEY = "kavtsya.member_code";

/**
 * The Customer's stable member code (#21, ADR 0006): the offline fallback the
 * CafeOwner types when the QR can't be scanned. The code never rotates, so the
 * device cache is authoritative once filled: cached → shown instantly with no
 * network at all (the whole point — a basement café with no signal); not yet
 * cached → fetched once and stored. A first launch that is offline retries on
 * the next mount; until then the QR screen simply omits the code line.
 */
export function useMemberCode(): string | null {
  const [memberCode, setMemberCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const cached = await SecureStore.getItemAsync(STORAGE_KEY);
      if (cached) {
        if (active) setMemberCode(cached);
        return;
      }
      try {
        const fetched = await fetchMemberCode();
        await SecureStore.setItemAsync(STORAGE_KEY, fetched);
        if (active) setMemberCode(fetched);
      } catch {
        // Offline before the first fetch ever succeeded: nothing to show yet.
        // The QR path still works when back online; we retry on next mount.
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return memberCode;
}
