import type { CafeBalance } from "@kavtsya/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { BeanRow } from "@/components/bean-row";
import { Berehynia } from "@/components/berehynia";
import { BottomSheet } from "@/components/bottom-sheet";
import { Button } from "@/components/button";
import { QRPlate } from "@/components/qr-plate";
import { StatusStrip } from "@/components/status-strip";
import { Heading } from "@/components/text";
import { useMemberCode } from "@/features/loyalty/use-member-code";
import { useQrToken } from "@/features/loyalty/use-qr-token";
import { fetchBalances } from "@/lib/api";
import { BEAN_FORMS, pluralizeUk } from "@/lib/plural";
import { fontFamily, useTheme } from "@/theme";

import { CafeCardHeader } from "./cafe-card-header";
import { rewardLabel } from "./reward";

/** How often the open sheet re-reads balances to notice the barista's confirm. */
const POLL_MS = 2500;

/**
 * The customer side of a Redemption (1g/1h, one-scan model, ADR 0010). The
 * Customer taps «Як отримати» on a ready Café and shows this sheet — the *same*
 * rotating QR, no second scan — with the ledger math stated up front. There is
 * no confirm button here: the CafeOwner confirms on their device. While the
 * sheet is open we poll the balance; when it drops (the confirm spent the
 * threshold) the sheet flips to the 1h success narration. `null` cafe keeps the
 * sheet closed.
 */
export function RedemptionSheet({
  cafe,
  onClose,
}: {
  cafe: CafeBalance | null;
  onClose: () => void;
}) {
  const t = useTheme();
  const { token } = useQrToken();
  const memberCode = useMemberCode();

  const cafeId = cafe?.cafeId;
  const openBalance = cafe?.balance;

  // The remaining balance once a confirm is detected, tied to the Café it was
  // detected for — so reopening for another Café starts pre-confirm without a
  // setState-in-effect reset (the adjust-state-on-render pattern, cf.
  // use-member-code).
  const [detected, setDetected] = useState<{
    cafeId: string | undefined;
    remaining: number | null;
  }>({ cafeId, remaining: null });
  if (detected.cafeId !== cafeId) setDetected({ cafeId, remaining: null });
  const remaining = detected.cafeId === cafeId ? detected.remaining : null;

  // Watch for the CafeOwner's confirm: a drop below the balance at open means
  // the threshold was spent (a bare Purchase would only raise it).
  useEffect(() => {
    if (
      cafeId === undefined ||
      openBalance === undefined ||
      remaining !== null
    ) {
      return;
    }
    const id = setInterval(() => {
      void (async () => {
        try {
          const latest = await fetchBalances();
          const now = latest.find((b) => b.cafeId === cafeId);
          if (now && now.balance < openBalance) {
            setDetected({ cafeId, remaining: now.balance });
          }
        } catch {
          // Transient — the next tick retries.
        }
      })();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [cafeId, openBalance, remaining]);

  return (
    <BottomSheet visible={cafe !== null} onClose={onClose}>
      {cafe === null ? null : remaining !== null ? (
        <RedemptionSuccess
          cafe={cafe}
          remaining={remaining}
          onClose={onClose}
        />
      ) : (
        <View style={{ alignSelf: "stretch", alignItems: "center", gap: 10 }}>
          <Berehynia size={18} />
          <Heading size={24} accessibilityRole="header">
            Винагорода готова
          </Heading>
          <Text
            style={{
              fontSize: 13.5,
              fontFamily: fontFamily.body.semibold,
              color: t.c["text-secondary"],
              textAlign: "center",
            }}
          >
            {rewardLabel(cafe.reward)} · {cafe.cafeName}
          </Text>
          <QRPlate token={token} memberCode={memberCode} />
          <Text
            style={{
              maxWidth: 240,
              fontSize: 13.5,
              lineHeight: 20,
              fontFamily: fontFamily.body.regular,
              color: t.c["text-secondary"],
              textAlign: "center",
            }}
          >
            Покажи цей QR кавовару — він підтвердить Винагороду. Спишеться{" "}
            {cafe.threshold} {pluralizeUk(cafe.threshold, BEAN_FORMS)}, решта
            збережеться
          </Text>
          <View style={{ alignSelf: "stretch" }}>
            <Button
              title="Пізніше"
              variant="secondary"
              testID="redemption-later"
              onPress={onClose}
            />
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

/** The 1h/1r success narration, shown in-sheet once the confirm is detected. */
function RedemptionSuccess({
  cafe,
  remaining,
  onClose,
}: {
  cafe: CafeBalance;
  remaining: number;
  onClose: () => void;
}) {
  const t = useTheme();
  const toNext = Math.max(0, cafe.threshold - remaining);
  return (
    <View style={{ alignSelf: "stretch", gap: t.space[3] }}>
      <StatusStrip
        intent="success"
        title="Винагороду отримано!"
        detail={`${rewardLabel(cafe.reward)} · −${cafe.threshold} ${pluralizeUk(cafe.threshold, BEAN_FORMS)}`}
      />
      <View
        style={{
          backgroundColor: t.c.surface,
          borderWidth: 1,
          borderColor: t.c.border,
          borderRadius: t.radius.md,
          paddingVertical: 14,
          paddingHorizontal: 16,
          gap: 6,
        }}
      >
        <CafeCardHeader cafe={cafe} />
        <Text
          style={{
            fontSize: 13,
            fontFamily: fontFamily.body.regular,
            color: t.c["text-muted"],
          }}
        >
          {remaining} {pluralizeUk(remaining, BEAN_FORMS)} збережено · ще{" "}
          {toNext} до наступної
        </Text>
        <BeanRow balance={remaining} threshold={cafe.threshold} />
      </View>
      <Button title="Готово" testID="redemption-done" onPress={onClose} />
    </View>
  );
}
