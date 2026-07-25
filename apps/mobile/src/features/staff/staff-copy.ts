import { pluralizeUk, SCAN_FORMS } from "@/lib/plural";

/**
 * The words for the CafeOwner's two staff boards — the Barista Roster (5b) and
 * the «Зміна» board (5c), whose rows and confirm dialogs (6c/6d) say the same
 * things about the same people. Copy lives here, apart from the screens, because
 * a confirm dialog must name the *actual* consequences: the sentences are derived
 * from the shift's facts, so they can be tested without a renderer. The rendering
 * counterpart is `components/staff-list.tsx`.
 *
 * Deliberate deviation from the mockups: they read «Його активну зміну…» / «на
 * його пристрої» about Марко. We only know a barista's name, never their
 * pronouns, so the copy uses gender-neutral phrasing («Активну зміну буде
 * завершено», «на пристрої бариста») — same three consequences, nobody
 * misgendered.
 */

/** Everything a confirm dialog says about one staff action — both button verbs included. */
export type StaffConfirm = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
};

/** An instant as the café's wall-clock time (the Kyiv business day, #112). */
export function shiftClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  });
}

/** «N сканів» — a shift's issued-Зернятка tally, correctly pluralized. */
export function scansLabel(count: number): string {
  return `${count} ${pluralizeUk(count, SCAN_FORMS)}`;
}

/**
 * 6d «Завершити зміну?» — the facts of the shift being ended (since when, how
 * many Зернятка) plus the effect the barista will feel immediately (ADR 0013:
 * the owner may end a shift, and the scanner is pinned to the grant).
 */
export function endShiftConfirm(shift: {
  startedAt: string;
  scanCount: number;
}): StaffConfirm {
  return {
    title: "Завершити зміну?",
    body:
      `З ${shiftClock(shift.startedAt)} · ${scansLabel(shift.scanCount)}. ` +
      "Сканер на пристрої бариста закриється одразу.",
    confirmLabel: "Завершити",
    cancelLabel: "Скасувати",
  };
}

/**
 * 6c «Прибрати з ростеру?» — reversible, so the tone stays neutral: what access
 * is lost, that an active shift ends (only said when one is actually running —
 * a consequence that isn't true would train the owner to ignore the dialog), and
 * the way back in through the poster (ADR 0013).
 */
export function removeFromRosterConfirm(barista: {
  name: string;
  onShift: boolean;
}): StaffConfirm {
  const activeShift = barista.onShift ? "Активну зміну буде завершено. " : "";
  return {
    title: "Прибрати з ростеру?",
    body:
      `${barista.name} більше не зможе починати Зміни. ${activeShift}` +
      "Надіслати запит знову можна через постер.",
    confirmLabel: "Прибрати",
    cancelLabel: "Скасувати",
  };
}
