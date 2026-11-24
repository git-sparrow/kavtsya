import type { DeletionPreview } from "@kavtsya/shared";
import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteAccount, fetchDeletionPreview } from "@/lib/api";

import { cafeOwnerCopy, customerCopy } from "./delete-account-copy";
import { useSignOut } from "./sign-out";

/**
 * The account-deletion exit (#143, redesign turns 6b/6e and 7d/7h) — the UI in
 * front of #81's tombstone. Two screens, one moment: a Customer confirms losing
 * their Зернятка (6b), a CafeOwner confirms closing their Café (7d). Which one
 * opens is decided by what the account actually owns, not by the Mode it is
 * currently in — leaving is an account-level act.
 *
 * Both are `danger` ConfirmDialogs, and both are **non-dismissible**: the scrim
 * and the OS back gesture do not cancel here, only an explicit button does. That
 * is the single app-wide exception to the dialog rule (catalog §10), because a
 * stray tap must not be able to answer a question this permanent — in either
 * direction. Focus starts on the safe action, as every danger tone does.
 *
 * Screen 7a «Спершу — кав'ярня» is deliberately not built: its only job was to
 * intercept an owner and offer transfer as the better exit, and with transfer
 * post-v1 (#160) there is no second exit to offer — so intercepting would be
 * friction that protects nobody, and ADR 0014 is explicit that deletion is never
 * blocked. The owner goes straight from the Settings row to 7d. The wording
 * deviations that follow from the same decision live in `delete-account-copy`.
 */

/**
 * The deletion flow as one piece of state, so Settings only has to render a row
 * and drop {@link DeleteAccountDialog} next to it.
 *
 * `open()` fetches the inventory FIRST and shows the dialog only once it has it:
 * the question is not worth asking without its consequences attached, so a
 * failed read surfaces as an error rather than as a vaguer confirm.
 */
export function useDeleteAccount(): {
  open: () => Promise<void>;
  cancel: () => void;
  confirm: () => Promise<void>;
  preview: DeletionPreview | null;
  loading: boolean;
  deleting: boolean;
  error: string | null;
} {
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signOut = useSignOut();

  const open = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPreview(await fetchDeletionPreview());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не вдалося відкрити видалення",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const cancel = useCallback(() => setPreview(null), []);

  const confirm = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      // The account is gone; sign out like any sign-out, so the router's
      // session guard swaps back to the sign-in screen and the account's data
      // leaves the device. It holds although the server no longer recognises
      // the cookie: see `signOut`.
      await signOut();
    } catch (e) {
      // Nothing was deleted — close the dialog and say so, rather than leaving
      // a spinning confirm the account can't get out of.
      setDeleting(false);
      setPreview(null);
      setError(e instanceof Error ? e.message : "Не вдалося видалити акаунт");
    }
  }, [signOut]);

  return { open, cancel, confirm, preview, loading, deleting, error };
}

/**
 * Renders whichever confirm the account has earned, or nothing while none is
 * pending — the mount-only-while-open contract `ConfirmDialog` asks its callers
 * for. Owning a Café is what makes it the owner's variant.
 */
export function DeleteAccountDialog({
  preview,
  deleting,
  onConfirm,
  onCancel,
}: {
  preview: DeletionPreview | null;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!preview) return null;

  const isCafeOwner = preview.cafes.length > 0;
  const { title, body } = isCafeOwner
    ? cafeOwnerCopy(preview)
    : customerCopy(preview);

  return (
    <ConfirmDialog
      tone="danger"
      chip={{ glyph: "warning", tone: "danger" }}
      title={title}
      body={body}
      confirmLabel={
        isCafeOwner ? "Так, закрити назавжди" : "Так, видалити назавжди"
      }
      cancelLabel={isCafeOwner ? "Скасувати" : "Залишитися"}
      // The one dialog in the app that a scrim tap or back gesture cannot answer.
      dismissible={false}
      busy={deleting}
      testID="settings.delete-account.dialog"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
