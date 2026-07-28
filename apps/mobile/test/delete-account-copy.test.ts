import { describe, expect, it } from "vitest";

import type { CafeBalance, DeletionPreview } from "@kavtsya/shared";
import {
  cafeOwnerCopy,
  customerCopy,
} from "../src/features/account/delete-account-copy";

/**
 * The copy of the delete-account exit (#143, screens 6b/7d). It is tested like
 * any other logic because it IS logic here: the whole point of the screen is
 * that the numbers it quotes are the real ones, correctly agreed in Ukrainian.
 * A confirm that says «2 зернят» undermines exactly the trust it exists to earn.
 */

function balance(cafeName: string, n: number): CafeBalance {
  return {
    cafeId: "00000000-0000-4000-8000-000000000000",
    cafeName,
    balance: n,
    threshold: 10,
    reward: null,
    archived: false,
  };
}

const empty: DeletionPreview = { balances: [], cafes: [] };

describe("customerCopy (6b)", () => {
  it("names every Café balance that dies, agreed in Ukrainian", () => {
    const { title, body } = customerCopy({
      ...empty,
      balances: [balance("Ранок", 9), balance("Вечір", 2), balance("Ніч", 1)],
    });

    expect(title).toBe("Видалити акаунт?");
    expect(body).toContain("9 зернят у «Ранок»");
    expect(body).toContain("2 зернятка у «Вечір»");
    expect(body).toContain("1 зернятко у «Ніч»");
  });

  it("still states the consequences when there is nothing to lose yet", () => {
    const { body } = customerCopy(empty);

    expect(body).toContain("історія Ворожки");
    expect(body).toContain(
      "Це незворотно — повернути їх не зможе ніхто, навіть підтримка",
    );
    // No dangling «Ти втрачаєш:» with an empty list behind it.
    expect(body).not.toContain("Ти втрачаєш");
  });

  it("omits a Café the Customer has already spent down to zero", () => {
    const { body } = customerCopy({
      ...empty,
      balances: [balance("Ранок", 4), balance("Порожня", 0)],
    });

    expect(body).toContain("4 зернятка у «Ранок»");
    expect(body).not.toContain("Порожня");
  });
});

describe("cafeOwnerCopy (7d)", () => {
  const demo = { cafeId: "c1", cafeName: "Демо", affectedCustomers: 37 };

  it("names the Café and quantifies who it strands", () => {
    const { title, body } = cafeOwnerCopy({ ...empty, cafes: [demo] });

    expect(title).toBe("Закрити «Демо» назавжди?");
    expect(body).toContain(
      "37 клієнтів втратять свої зернятка тут — і побачать, що кав'ярня закрита",
    );
    expect(body).toContain("Зміни завершаться, постер перестане працювати");
    expect(body).toContain(
      "Це незворотно — повернути це не зможе ніхто, навіть підтримка",
    );
  });

  it("does not promise a notification nothing sends", () => {
    const { body } = cafeOwnerCopy({ ...empty, cafes: [demo] });

    // The mock's «і ми їм про це повідомимо» is deliberately not built (#81
    // archives the Café, it notifies nobody); the honest version says what the
    // Café's Customers will actually see.
    expect(body).not.toContain("повідомимо");
    expect(body).toContain("і побачать, що кав'ярня закрита");
  });

  it("tells the owner their own Зернятка go too", () => {
    const { body } = cafeOwnerCopy({
      balances: [balance("Ранок", 5)],
      cafes: [demo],
    });

    expect(body).toContain("зникне і твій акаунт");
    expect(body).toContain("5 зернят у «Ранок»");
  });

  it("counts per Café, never summed, when the account owns several", () => {
    const { title, body } = cafeOwnerCopy({
      ...empty,
      cafes: [demo, { cafeId: "c2", cafeName: "Вечір", affectedCustomers: 4 }],
    });

    expect(title).toBe("Закрити свої кав'ярні назавжди?");
    // One Customer can hold Зернятка at both, so a 41 total would count them
    // twice — and «тут» would name a Café the plural title never identified.
    expect(body).toContain(
      "Клієнти втратять свої зернятка: 37 у «Демо», 4 у «Вечір»",
    );
    expect(body).not.toContain("41");
    expect(body).not.toContain("тут");
  });

  it("omits a Café that would strand nobody from the per-Café list", () => {
    const { body } = cafeOwnerCopy({
      ...empty,
      cafes: [demo, { cafeId: "c2", cafeName: "Тиха", affectedCustomers: 0 }],
    });

    expect(body).toContain("37 у «Демо»");
    expect(body).not.toContain("Тиха");
  });

  it("agrees the verb with a single stranded Customer", () => {
    const { body } = cafeOwnerCopy({
      ...empty,
      cafes: [{ cafeId: "c1", cafeName: "Тиха", affectedCustomers: 1 }],
    });

    expect(body).toContain("1 клієнт втратить свої зернятка тут — і побачить");
  });

  it("uses the plural verb for a few and for many", () => {
    const few = cafeOwnerCopy({
      ...empty,
      cafes: [{ cafeId: "c1", cafeName: "Тиха", affectedCustomers: 3 }],
    });
    const many = cafeOwnerCopy({
      ...empty,
      cafes: [{ cafeId: "c1", cafeName: "Тиха", affectedCustomers: 12 }],
    });

    expect(few.body).toContain(
      "3 клієнти втратять свої зернятка тут — і побачать",
    );
    expect(many.body).toContain(
      "12 клієнтів втратять свої зернятка тут — і побачать",
    );
  });

  it("drops the count rather than saying «0 клієнтів»", () => {
    const { body } = cafeOwnerCopy({
      ...empty,
      cafes: [{ cafeId: "c1", cafeName: "Тиха", affectedCustomers: 0 }],
    });

    expect(body).not.toContain("0 ");
    expect(body).toContain("Кав'ярня закриється для всіх");
  });
});
