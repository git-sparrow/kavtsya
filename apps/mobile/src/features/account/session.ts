import { useEffect, useEffectEvent } from "react";

import { forgetDeviceId } from "@/features/push/push-registration";
import { authClient } from "@/lib/auth-client";

import {
  accountOnDevice,
  clearAccountOnDevice,
  forgetAccount,
  setAccountOnDevice,
} from "./account-storage";

/**
 * Only `ended` is the server's word (or this device's sign-out); `unreachable`
 * keeps the account's data, because losing the network is not a session ending
 * (ADR 0006).
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

async function forgetEndedAccount(state: SessionState): Promise<void> {
  if (state.kind === "pending" || state.kind === "unreachable") return;
  const previous = await accountOnDevice();
  if (state.kind === "signedIn") {
    if (previous === state.userId) return;
    if (previous)
      await Promise.all([forgetAccount(previous), forgetDeviceId()]);
    await setAccountOnDevice(state.userId);
  } else {
    await Promise.all([previous && forgetAccount(previous), forgetDeviceId()]);
    await clearAccountOnDevice();
  }
}

let settling = Promise.resolve();

export function useSessionForgettingEndedAccounts(): SessionState {
  const state = toSessionState(authClient.useSession());
  const userId = state.kind === "signedIn" ? state.userId : null;

  const settle = useEffectEvent(() => {
    settling = settling.then(() => forgetEndedAccount(state)).catch(() => {});
  });
  useEffect(() => settle(), [state.kind, userId]);

  return state;
}
