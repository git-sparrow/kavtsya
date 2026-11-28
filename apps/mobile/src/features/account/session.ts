import { useEffect, useEffectEvent } from "react";

import { forgetDeviceId } from "@/features/push/push-registration";
import { authClient } from "@/lib/auth-client";

import {
  forgetAccount,
  heldAccount,
  holdAccount,
  releaseAccount,
} from "./account-storage";

/**
 * What this device knows about its session. `ended` and `unreachable` both
 * show the sign-in screen, but only `ended` is the server's word (or this
 * device's sign-out); `unreachable` keeps the account's data, because losing the
 * network is not a session ending (#21, ADR 0006).
 */
export type SessionState =
  | { kind: "pending" }
  | { kind: "signedIn"; userId: string }
  | { kind: "ended" }
  | { kind: "unreachable" };

type SessionQuery = ReturnType<typeof authClient.useSession>;

/**
 * Better Auth 1.7.18 (`client/session-atom.mjs`, read 2026-11-28) keeps the
 * cached session when the request throws, nulls it on a 401, and nulls it with
 * no error when the server answers `null`: the server's reply for a revoked or
 * expired session (`api/routes/session.mjs:155-164`).
 */
function toSessionState({
  data,
  error,
  isPending,
}: SessionQuery): SessionState {
  if (data) return { kind: "signedIn", userId: data.user.id };
  if (isPending) return { kind: "pending" };
  return error && error.status !== 401
    ? { kind: "unreachable" }
    : { kind: "ended" };
}

/**
 * The single place an account's data leaves the device (#402, #438): whenever
 * its session ends, through sign-out, deletion, expiry or revocation, and
 * whenever another account's session replaces it.
 */
async function settleHeldAccount(state: SessionState): Promise<void> {
  if (state.kind === "pending" || state.kind === "unreachable") return;
  const held = await heldAccount();
  if (state.kind === "signedIn") {
    if (held === state.userId) return;
    if (held) await Promise.all([forgetAccount(held), forgetDeviceId()]);
    await holdAccount(state.userId);
  } else {
    await Promise.all([held && forgetAccount(held), forgetDeviceId()]);
    await releaseAccount();
  }
}

let settling = Promise.resolve();

/** This device's session, with ended accounts' data removed as it ends. */
export function useDeviceSession(): SessionState {
  const state = toSessionState(authClient.useSession());
  const userId = state.kind === "signedIn" ? state.userId : null;

  const settle = useEffectEvent(() => {
    settling = settling.then(() => settleHeldAccount(state)).catch(() => {});
  });
  useEffect(() => settle(), [state.kind, userId]);

  return state;
}
