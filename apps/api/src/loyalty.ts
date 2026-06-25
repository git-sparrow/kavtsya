import type { LoyaltyProgram, Reward, RewardDefaults } from "@kavtsya/shared";
import { loyaltyProgramSchema, rewardDefaultsSchema } from "@kavtsya/shared";
import type { Database } from "./db";

/**
 * The loyalty program a Café runs (CONTEXT → Зернятко, Reward) and the
 * platform-default Reward set it chooses from.
 *
 * The program lives on the `cafes` row (1:1 in v1): the Зернятко `threshold`
 * (default 10, set by the column) and the chosen `reward` (null until picked).
 * The default Reward set is read from `platform_config`, never hardcoded, so the
 * Platform can tune it without a code deploy (story 38).
 */

type ProgramRow = { zernyatko_threshold: number; reward: unknown };

// The `reward` JSONB column is an untrusted boundary like any other input, so
// it's validated on read with the same Zod schema the write path enforces.
function toProgram(row: ProgramRow): LoyaltyProgram {
  return loyaltyProgramSchema.parse({
    threshold: row.zernyatko_threshold,
    reward: row.reward,
  });
}

/** The platform-default Reward set, read from `platform_config` (story 38). */
export async function getRewardDefaults(db: Database): Promise<RewardDefaults> {
  const [row] = await db<{ value: unknown }[]>`
    select "value" from platform_config where "key" = 'reward_defaults'
  `;
  return rewardDefaultsSchema.parse(row?.value ?? []);
}

/** Whether a Reward's type is currently offered by the platform-default set. */
export function rewardTypeIsOffered(
  reward: Reward,
  defaults: RewardDefaults,
): boolean {
  return defaults.some((d) => d.type === reward.type);
}

/**
 * The loyalty program for a Café the given account owns, or null when the Café
 * doesn't exist or isn't theirs — the ownership check and the read are the same
 * query, so a non-owner can't tell the two apart.
 */
export async function getLoyaltyProgram(
  db: Database,
  cafeId: string,
  ownerUserId: string,
): Promise<LoyaltyProgram | null> {
  const [row] = await db<ProgramRow[]>`
    select "zernyatko_threshold", "reward"
    from cafes
    where "id" = ${cafeId} and "owner_user_id" = ${ownerUserId}
  `;
  return row ? toProgram(row) : null;
}

/**
 * Write the program for a Café the given account owns; returns the stored
 * program, or null when the Café isn't theirs. Config changes apply going
 * forward only — past Redemptions snapshot their own threshold (#22).
 */
export async function updateLoyaltyProgram(
  db: Database,
  cafeId: string,
  ownerUserId: string,
  program: LoyaltyProgram,
): Promise<LoyaltyProgram | null> {
  const [row] = await db<ProgramRow[]>`
    update cafes
    set "zernyatko_threshold" = ${program.threshold},
        "reward" = ${program.reward ? db.json(program.reward) : null}
    where "id" = ${cafeId} and "owner_user_id" = ${ownerUserId}
    returning "zernyatko_threshold", "reward"
  `;
  return row ? toProgram(row) : null;
}
