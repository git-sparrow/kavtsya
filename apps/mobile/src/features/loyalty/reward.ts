import type { Reward, RewardType } from "@kavtsya/shared";

/** Reward types that carry a parameter, and the keyboard/placeholder to collect it. */
export const REWARD_PARAM: Partial<
  Record<RewardType, { label: string; placeholder: string; numeric: boolean }>
> = {
  free_specific_drink: {
    label: "Напій",
    placeholder: "Напр. Капучино",
    numeric: false,
  },
  fixed_discount: {
    label: "Знижка, ₴",
    placeholder: "Напр. 30",
    numeric: true,
  },
  percent_discount: {
    label: "Знижка, %",
    placeholder: "Напр. 10",
    numeric: true,
  },
};

/** The editable param of a Reward as a text-input string ("" when none). */
export function rewardParamValue(reward: Reward | null): string {
  if (!reward) return "";
  if (reward.type === "free_specific_drink") return reward.item;
  if (reward.type === "fixed_discount") return String(reward.amountUah);
  if (reward.type === "percent_discount") return String(reward.percent);
  return "";
}

/** A configured Reward as one display line (balances list, scan confirmation). */
export function rewardLabel(reward: Reward | null): string {
  if (!reward) return "";
  switch (reward.type) {
    case "free_drink":
      return "Безкоштовний напій";
    case "free_specific_drink":
      return `Безкоштовно: ${reward.item}`;
    case "fixed_discount":
      return `Знижка ₴${reward.amountUah}`;
    case "percent_discount":
      return `Знижка ${reward.percent}%`;
  }
}

/** Assemble a Reward from the chosen type + raw param; throws if the param is missing. */
export function buildReward(
  type: RewardType | null,
  param: string,
): Reward | null {
  if (type === null) return null;
  const trimmed = param.trim();
  switch (type) {
    case "free_drink":
      return { type };
    case "free_specific_drink":
      if (!trimmed) throw new Error("missing item");
      return { type, item: trimmed };
    case "fixed_discount":
      if (!trimmed) throw new Error("missing amount");
      return { type, amountUah: Number(trimmed) };
    case "percent_discount":
      if (!trimmed) throw new Error("missing percent");
      return { type, percent: Number(trimmed) };
  }
}
