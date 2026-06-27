import type { Reward, RewardType } from "@kavtsya/shared";
import { useEffect, useState } from "react";

import { fetchProgram, fetchRewardDefaults, updateProgram } from "@/lib/api";

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
  const [defaults, setDefaults] = useState<{ type: RewardType; label: string }[]>([]);
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
        if (active) setError(e instanceof Error ? e.message : "Помилка завантаження");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [cafeId]);

  function editThreshold(value: string) {
    setThreshold(value);
    setSaved(false);
  }

  function selectReward(type: RewardType | null) {
    setRewardType(type);
    setParam("");
    setSaved(false);
  }

  function editParam(value: string) {
    setParam(value);
    setSaved(false);
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
      const written = await updateProgram(cafeId, { threshold: thresholdNum, reward });
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
    rewardType,
    selectReward,
    param,
    editParam,
    paramSpec,
    save,
  };
}
