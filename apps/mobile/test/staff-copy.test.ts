import { describe, expect, it } from "vitest";

import {
  endShiftConfirm,
  removeFromRosterConfirm,
  scansLabel,
  shiftClock,
} from "../src/features/staff/staff-copy";

describe("shiftClock", () => {
  it("reads an instant as the café's Kyiv wall clock", () => {
    // 05:12 UTC in July is 08:12 in Kyiv (EEST, +3).
    expect(shiftClock("2026-07-25T05:12:00.000Z")).toBe("08:12");
  });

  it("follows Kyiv across DST, not a fixed offset", () => {
    // The same UTC hour reads 08:12 in summer (above, EEST +3) but 07:12 in
    // winter. A hardcoded offset would get one of the two wrong — and the board
    // would label a shift «today» at a time reading like yesterday, since the
    // server buckets «closed today» by the Kyiv day.
    expect(shiftClock("2026-01-15T05:12:00.000Z")).toBe("07:12");
  });

  it("zero-pads to a stable two-digit HH:MM", () => {
    expect(shiftClock("2026-07-25T04:05:00.000Z")).toBe("07:05");
  });
});

describe("scansLabel", () => {
  it("pluralizes the Зернятка tally the Ukrainian way", () => {
    expect(scansLabel(1)).toBe("1 скан");
    expect(scansLabel(2)).toBe("2 скани");
    expect(scansLabel(14)).toBe("14 сканів");
  });
});

describe("endShiftConfirm", () => {
  const shift = { startedAt: "2026-07-25T05:12:00.000Z", scanCount: 14 };

  it("titles the action with the verb, not «Так/Ні»", () => {
    expect(endShiftConfirm(shift).title).toBe("Завершити зміну?");
    expect(endShiftConfirm(shift).confirmLabel).toBe("Завершити");
  });

  it("states the shift facts the owner is ending", () => {
    expect(endShiftConfirm(shift).body).toContain("З 08:12 · 14 сканів");
  });

  it("names the immediate effect on the barista's device", () => {
    expect(endShiftConfirm(shift).body).toContain(
      "Сканер на пристрої бариста закриється одразу",
    );
  });

  it("stays honest when nothing has been scanned yet", () => {
    expect(endShiftConfirm({ ...shift, scanCount: 0 }).body).toContain(
      "З 08:12 · 0 сканів",
    );
  });
});

describe("removeFromRosterConfirm", () => {
  it("names the person in the title's own verb form", () => {
    const dialog = removeFromRosterConfirm({ name: "Марко", onShift: false });
    expect(dialog.title).toBe("Прибрати з ростеру?");
    expect(dialog.confirmLabel).toBe("Прибрати");
  });

  it("states the lost access and the way back", () => {
    const { body } = removeFromRosterConfirm({ name: "Марко", onShift: false });
    expect(body).toContain("Марко більше не зможе починати Зміни");
    expect(body).toContain("Надіслати запит знову можна через постер");
  });

  it("warns that the active shift ends — only when there is one", () => {
    expect(
      removeFromRosterConfirm({ name: "Марко", onShift: true }).body,
    ).toContain("Активну зміну буде завершено");
    expect(
      removeFromRosterConfirm({ name: "Марко", onShift: false }).body,
    ).not.toContain("Активну зміну");
  });
});

describe("both staff confirms", () => {
  it("carry a verb on each button — never «Так/Ні» (catalog §10)", () => {
    for (const dialog of [
      endShiftConfirm({ startedAt: "2026-07-25T05:12:00.000Z", scanCount: 3 }),
      removeFromRosterConfirm({ name: "Марко", onShift: true }),
    ]) {
      expect(dialog.confirmLabel).not.toMatch(/^(Так|Ні)$/);
      expect(dialog.cancelLabel).toBe("Скасувати");
    }
  });
});
