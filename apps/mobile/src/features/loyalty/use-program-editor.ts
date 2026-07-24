import type { Reward, RewardType } from "@kavtsya/shared";
import { useEffect, useState } from "react";

import { fetchProgram, fetchRewardDefaults, updateProgram } from "@/lib/api";

import { clampThreshold } from "./program";
import { buildReward, REWARD_PARAM, rewardParamValue } from "./reward";

/**
 * Drives the loyalty-program editor for one Café (#18): loads the current
 * threshold + Reward and the platform-default Reward set on mount, holds the
 * form state, validates, and writes back. The server stays the authority on
 * valid Rewards — this only mirrors what it returns. Editing anything clears
 * the "saved" flag so the confirmation never lingers over stale input.
 */
export function useProgramEditor(cafeId: string) {
  const [threshold, setThreshold] = useState("10");
  // null = "no Reward yet"; otherwise one of the platform-default types.
  const [rewardType, setRewardType] = useState<RewardType | null>(null);
  const [param, setParam] = useState("");
  const [defaults, setDefaults] = useState<
    { type: RewardType; label: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [program, rewardDefaults] = await Promise.all([
          fetchProgram(cafeId),
          fetchRewardDefaults(),
        ]);
        if (!active) return;
        setDefaults(rewardDefaults);
        setThreshold(String(program.threshold));
        setRewardType(program.reward?.type ?? null);
        setParam(rewardParamValue(program.reward));
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Помилка завантаження");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [cafeId]);

  // Any edit clears both the lingering "saved" confirmation and a stale
  // validation error, so neither hangs over input the user has since changed.
  function clearOutcome() {
    setSaved(false);
    setError(null);
  }

  function editThreshold(value: string) {
    setThreshold(value);
    clearOutcome();
  }

  /** Nudge the threshold by ±1 from the stepper, clamped to the floor of 1. */
  function stepThreshold(delta: number) {
    setThreshold(String(clampThreshold(Number(threshold), delta)));
    clearOutcome();
  }

  function selectReward(type: RewardType | null) {
    setRewardType(type);
    setParam("");
    clearOutcome();
  }

  function editParam(value: string) {
    setParam(value);
    clearOutcome();
  }

  async function save() {
    setError(null);
    setSaved(false);
    const thresholdNum = Number(threshold);
    if (!Number.isInteger(thresholdNum) || thresholdNum < 1) {
      setError("Поріг має бути цілим числом від 1");
      return;
    }
    let reward: Reward | null;
    try {
      reward = buildReward(rewardType, param);
    } catch {
      setError("Заповніть деталі винагороди");
      return;
    }

    setSaving(true);
    try {
      const written = await updateProgram(cafeId, {
        threshold: thresholdNum,
        reward,
      });
      setThreshold(String(written.threshold));
      setRewardType(written.reward?.type ?? null);
      setParam(rewardParamValue(written.reward));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  const paramSpec = rewardType ? REWARD_PARAM[rewardType] : undefined;

  return {
    loading,
    error,
    saving,
    saved,
    defaults,
    threshold,
    editThreshold,
    stepThreshold,
    rewardType,
    selectReward,
    param,
    editParam,
    paramSpec,
    save,
  };
}
