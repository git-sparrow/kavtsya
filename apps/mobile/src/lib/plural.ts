/**
 * Ukrainian count agreement. Ukrainian picks one of three noun forms by the
 * count's last digits: the *one* form (1, 21, 31 — but not 11), the *few* form
 * (2–4, 22–24 — but not 12–14), and the *many* form (0, 5–20, 25–30, …). Pass
 * the three forms of a noun and this returns the right one for `n`, so every
 * «N зернят / клієнтів» line reads correctly without re-deriving the rule.
 */
export function pluralizeUk(
  n: number,
  forms: { one: string; few: string; many: string },
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return forms.few;
  }
  return forms.many;
}

/** «клієнт» in its three count forms — the owner's returning/active figures. */
export const CLIENT_FORMS = { one: "клієнт", few: "клієнти", many: "клієнтів" };

/** «зернятко» in its three count forms — 1 зернятко / 3 зернятка / 7 зернят. */
export const BEAN_FORMS = { one: "зернятко", few: "зернятка", many: "зернят" };
