import type {
  LoyaltyProgram,
  Reward,
  RewardDefaults,
  RewardType,
} from "@kavtsya/shared";
import { useCallback, useState } from "react";

import { fetchProgram, fetchRewardDefaults, updateProgram } from "@/lib/api";
import { useApiResource } from "@/lib/use-api-resource";
import { useScreenAction } from "@/lib/use-screen-action";

import { clampThreshold } from "./program";
import { buildReward, REWARD_PARAM, rewardParamValue } from "./reward";

/** Everything the editor needs before it can render a form: read as one resource. */
type ProgramSetup = LoyaltyProgram & { defaults: RewardDefaults };

/** The editable form, seeded from the server and owned by the CafeOwner after that. */
type Form = {
  threshold: string;
  rewardType: RewardType | null;
  param: string;
};

const EMPTY_FORM: Form = { threshold: "10", rewardType: null, param: "" };

function formFor({ threshold, reward }: LoyaltyProgram): Form {
  return {
    threshold: String(threshold),
    rewardType: reward?.type ?? null,
    param: rewardParamValue(reward),
  };
}

/**
 * Drives the loyalty-program editor for one Café (#18): loads the current
 * threshold + Reward and the platform-default Reward set on mount, holds the
 * form state, validates, and writes back. The server stays the authority on
 * valid Rewards — this only mirrors what it returns. Editing anything clears
 * the "saved" flag so the confirmation never lingers over stale input.
 */
export function useProgramEditor(cafeId: string) {
  const setup = useApiResource(
    useCallback(async (): Promise<ProgramSetup> => {
      const [program, defaults] = await Promise.all([
        fetchProgram(cafeId),
        fetchRewardDefaults(),
      ]);
      return { ...program, defaults };
    }, [cafeId]),
    "Помилка завантаження",
  );

  const [form, setForm] = useState<Form>(EMPTY_FORM);
  // The form is seeded from the server exactly once per read, then belongs to
  // the CafeOwner — so this remembers WHICH read seeded it rather than a
  // boolean, applied during that very render (the sanctioned
  // adjust-state-on-render pattern, as in `useMemberCode`). Their edits are
  // never overwritten by a read they have already seen.
  const [seededFrom, setSeededFrom] = useState<ProgramSetup | null>(null);
  if (setup.data && setup.data !== seededFrom) {
    setSeededFrom(setup.data);
    setForm(formFor(setup.data));
  }

  // The CafeOwner's own doing — a validation refusal or a failed write — folded
  // with the read that never landed into the one line the screen shows.
  const action = useScreenAction(setup);
  const [saved, setSaved] = useState(false);

  // Any edit clears the lingering "saved" confirmation and every stale error, so
  // nothing hangs over input the user has since changed. The read happens once
  // here, so a failed one is genuinely behind them by the time they type.
  function clearOutcome() {
    setSaved(false);
    action.clear();
  }

  function edit(change: Partial<Form>) {
    setForm((current) => ({ ...current, ...change }));
    clearOutcome();
  }

  /** Nudge the threshold by ±1 from the stepper, clamped to the floor of 1. */
  function stepThreshold(delta: number) {
    edit({ threshold: String(clampThreshold(Number(form.threshold), delta)) });
  }

  async function save() {
    clearOutcome();
    const thresholdNum = Number(form.threshold);
    if (!Number.isInteger(thresholdNum) || thresholdNum < 1) {
      action.refuse("Поріг має бути цілим числом від 1");
      return;
    }
    let reward: Reward | null;
    try {
      reward = buildReward(form.rewardType, form.param);
    } catch {
      action.refuse("Заповніть деталі винагороди");
      return;
    }

    await action.run(async () => {
      const written = await updateProgram(cafeId, {
        threshold: thresholdNum,
        reward,
      });
      setForm(formFor(written));
      setSaved(true);
    }, "Не вдалося зберегти");
  }

  return {
    loading: setup.loading,
    error: action.error,
    saving: action.busy,
    saved,
    defaults: setup.data?.defaults ?? [],
    threshold: form.threshold,
    editThreshold: (value: string) => edit({ threshold: value }),
    stepThreshold,
    rewardType: form.rewardType,
    selectReward: (type: RewardType | null) =>
      edit({ rewardType: type, param: "" }),
    param: form.param,
    editParam: (value: string) => edit({ param: value }),
    paramSpec: form.rewardType ? REWARD_PARAM[form.rewardType] : undefined,
    save,
  };
}
