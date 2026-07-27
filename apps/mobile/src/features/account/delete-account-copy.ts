import type { DeletionPreview, OwnedCafeClosure } from "@kavtsya/shared";

import { BEAN_FORMS, CLIENT_FORMS, pluralizeUk } from "@/lib/plural";

/**
 * The words of the delete-account exit (#143, screens 6b/7d), kept apart from
 * the dialog that renders them — like `staff-copy`, because this text is the
 * substance of the screen and is worth testing on its own. Every number in it
 * comes from `GET /api/me/deletion-preview` (#81), so the confirm quotes the
 * ledger rather than a guess, agreed the Ukrainian way.
 *
 * Deviations from the approved mocks, forced by café transfer staying post-v1
 * (#160, ADR 0014 — deletion is never blocked on an unbuilt feature):
 * - 7d's safe action reads «Скасувати», not «Краще передати кав'ярню»: a button
 *   must not name a destination that doesn't exist.
 * - 7d's «і ми їм про це повідомимо» is NOT said, because nothing sends that
 *   message — #81 archives the Café, it notifies no one. The copy states what
 *   the Café's Customers will actually see (a closed café and their frozen
 *   Зернятка, in their own list), keeping the sentence a fact instead of a
 *   promise the backend never keeps.
 * Both reverse when #160 lands.
 *
 * One further deviation, from #81 rather than the mocks: it asked for "typed/held
 * confirmation **per platform convention**", and on iOS that convention is a
 * destructive-styled confirm, not a type-the-word gate — which is also what turn
 * 6 then approved and #138 built. The friction #81 wanted is carried instead by
 * the pieces the approved anatomy does specify: the dialog is non-dismissible
 * (only an explicit button answers it), focus starts on the safe action, and the
 * consequences are named concretely above the buttons. If a real user test says
 * that is too easy to tap through, the escalation is a `ConfirmDialog` variant,
 * decided in #143 — not a second confirm bolted on here.
 */

/** The two strings a `ConfirmDialog` asks a question with. */
export interface DialogCopy {
  title: string;
  body: string;
}

/** The Зернятко inventory, as the confirm names it: «9 зернят у «Ранок»». */
function beansInventory(preview: DeletionPreview): string | null {
  // A Café spent down to zero costs the account nothing, so listing it would
  // pad the warning the screen exists to make honest.
  const held = preview.balances.filter((b) => b.balance > 0);
  if (held.length === 0) return null;
  return held
    .map(
      (b) =>
        `${b.balance} ${pluralizeUk(b.balance, BEAN_FORMS)} у «${b.cafeName}»`,
    )
    .join(", ");
}

/**
 * «37 клієнтів втратять свої зернятка тут — і побачать, що кав'ярня закрита» —
 * the weight of ONE Café's closure, spelled out (7d).
 *
 * BOTH verbs agree, not just the noun: Ukrainian takes the singular after a
 * *one* form, so 1 and 41 read «клієнт втратить … і побачить». The second clause
 * drops its pronoun rather than picking one, which keeps it agreeing with the
 * elided «клієнт» and avoids putting a gender on a real person.
 */
function customersLoseHere(n: number): string {
  const noun = pluralizeUk(n, CLIENT_FORMS);
  const one = noun === CLIENT_FORMS.one;
  return `${n} ${noun} ${one ? "втратить" : "втратять"} свої зернятка тут — і ${
    one ? "побачить" : "побачать"
  }, що кав'ярня закрита.`;
}

/**
 * The same weight across SEVERAL Cafés — «Клієнти втратять свої зернятка: 37 у
 * «Демо», 4 у «Вечір».»
 *
 * The counts are deliberately NOT summed. One Customer can hold Зернятка at two
 * of these Cafés, so a total would count them twice and inflate the very number
 * this screen exists to state honestly — and «тут» would name a Café the plural
 * title never identified. Per-Café is both true and clearer about what closes.
 */
function customersLosePerCafe(cafes: readonly OwnedCafeClosure[]): string {
  const named = cafes
    .filter((c) => c.affectedCustomers > 0)
    .map((c) => `${c.affectedCustomers} у «${c.cafeName}»`)
    .join(", ");
  return `Клієнти втратять свої зернятка: ${named} — і побачать, що кав'ярні закриті.`;
}

/** The Customer's question (6b): what disappears, named Café by Café. */
export function customerCopy(preview: DeletionPreview): DialogCopy {
  const inventory = beansInventory(preview);
  return {
    title: "Видалити акаунт?",
    body: [
      "Зникнуть усі зернятка й історія Ворожки — назавжди. Кав'ярні, де ти буваєш, тебе більше не впізнають.",
      inventory ? `Ти втрачаєш: ${inventory}.` : null,
      "Це незворотно — повернути їх не зможе ніхто, навіть підтримка.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/**
 * The CafeOwner's question (7d): the same moment, weighed in other people's
 * Зернятка. The title names the Café when there is one — the mock's «Закрити
 * «Демо» назавжди?» — and goes plural when the account owns several, which the
 * schema has always allowed (ADR 0003) even though v1 onboarding registers one.
 * The owner is a Customer too, so their own balances are named as well: no role
 * gets a gentler version of what it is about to lose.
 */
export function cafeOwnerCopy(preview: DeletionPreview): DialogCopy {
  const { cafes } = preview;
  const single: OwnedCafeClosure | null = cafes.length === 1 ? cafes[0]! : null;
  const anyAffected = cafes.some((c) => c.affectedCustomers > 0);
  const inventory = beansInventory(preview);

  return {
    title: single
      ? `Закрити «${single.cafeName}» назавжди?`
      : "Закрити свої кав'ярні назавжди?",
    body: [
      !anyAffected
        ? "Кав'ярня закриється для всіх."
        : single
          ? customersLoseHere(single.affectedCustomers)
          : customersLosePerCafe(cafes),
      "Зміни завершаться, постер перестане працювати.",
      inventory
        ? `Разом із кав'ярнею зникне і твій акаунт, а з ним — ${inventory}.`
        : "Разом із кав'ярнею зникне і твій акаунт.",
      // The same promise the Customer's confirm makes (#81 user story 5): the
      // permanence is total, and support is not a back door out of it.
      "Це незворотно — повернути це не зможе ніхто, навіть підтримка.",
    ].join(" "),
  };
}
