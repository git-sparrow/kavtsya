import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

import { accountKey } from "@/features/account/account-storage";
import { useMe } from "@/features/account/me-context";
import { fetchMemberCode } from "@/lib/api";

/** The pre-#91 account-less entry — deleted on sight so nobody inherits it. */
const LEGACY_STORAGE_KEY = "kavtsya.member_code";

/**
 * The Customer's stable member code (#21, ADR 0006): the offline fallback the
 * CafeOwner types when the QR can't be scanned. The code never rotates, so the
 * device cache is authoritative once filled: cached → shown instantly with no
 * network at all (the whole point — a basement café with no signal); not yet
 * cached → fetched once and stored. A first launch that is offline retries on
 * the next mount; until then the QR screen simply omits the code line.
 *
 * Null until the signed-in account is known — the cache is keyed by account
 * (#91), so there is nothing safe to show before that.
 */
export function useMemberCode(): string | null {
  const { me } = useMe();
  const userId = me?.id;
  // The code is stored WITH the account it belongs to, and an account switch
  // drops it during this very render (the sanctioned adjust-state-on-render
  // pattern) — the previous account's code never paints, not even for the
  // frame before an effect could run.
  const [entry, setEntry] = useState<{
    userId: string | undefined;
    code: string | null;
  }>({ userId, code: null });
  if (entry.userId !== userId) setEntry({ userId, code: null });

  useEffect(() => {
    if (!userId) return;
    let active = true;

    void SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY);

    async function load(storageKey: string) {
      const cached = await SecureStore.getItemAsync(storageKey);
      if (cached) {
        if (active) setEntry({ userId, code: cached });
        return;
      }
      try {
        const fetched = await fetchMemberCode();
        // Signed out mid-fetch: don't write back what sign-out cleared (#402).
        if (!active) return;
        await SecureStore.setItemAsync(storageKey, fetched);
        setEntry({ userId, code: fetched });
      } catch {
        // Offline before the first fetch ever succeeded: nothing to show yet.
        // The QR path still works when back online; we retry on next mount.
      }
    }

    // One entry PER ACCOUNT (#91): the member code is an earning identity, so
    // on a shared or handed-over device account B never inherits A's code.
    void load(accountKey("member_code", userId));
    return () => {
      active = false;
    };
  }, [userId]);

  return entry.userId === userId ? entry.code : null;
}
