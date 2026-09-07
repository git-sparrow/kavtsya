import type { PurchaseResult, Reward } from "@kavtsya/shared";
import {
  isRedemptionReady,
  isWellFormedMemberCode,
  normalizeMemberCode,
} from "@kavtsya/shared";
import {
  CameraView as CameraViewBase,
  type CameraViewProps,
  useCameraPermissions,
} from "expo-camera";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BeanRow } from "@/components/bean-row";
import { Berehynia } from "@/components/berehynia";
import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { StatusStrip } from "@/components/status-strip";
import { ErrorText, Heading, Muted, SectionLabel } from "@/components/text";
import { TextField } from "@/components/text-field";
import { rewardLabel } from "@/features/loyalty/reward";
import { rejectionCopy } from "@/features/scan/scan-copy";
import {
  type ScanState,
  useScanPurchase,
} from "@/features/scan/use-scan-purchase";
import { BEAN_FORMS, pluralizeUk } from "@/lib/plural";
import { fontFamily, toShadowStyle, useTheme } from "@/theme";

// Same React 19 strict-JSX workaround as react-native-qrcode-svg in
// customer-qr.tsx: expo-camera declares CameraView as a class whose type React
// 19 rejects; the runtime component is fine, only the type needs coercing.
const CameraView = CameraViewBase as unknown as ComponentType<CameraViewProps>;

/**
 * Whether the confirm-Redemption action is offered (#22, CONTEXT → Redemption):
 * the balance covers the Café's threshold and there is a Reward to claim. Thin
 * type-narrowing wrapper over the shared predicate (#113) — the readiness rule
 * itself lives in one place, so the barista's screen and the Customer's home can
 * never disagree. The server re-checks under its lock; this only decides display.
 */
function canRedeem(
  result: PurchaseResult,
): result is PurchaseResult & { reward: Reward } {
  return isRedemptionReady(result);
}

/**
 * The permanent role header (2a): «РЕЖИМ КАВОВАРА» over the Café name, so the
 * CafeOwner always sees which role they are in and which Café every scan
 * credits. Exported for the owner scan route; the shift's Scanner Mode passes
 * its own banner instead.
 */
export function ScanRoleHeader({ cafeName }: { cafeName: string }) {
  return (
    <View style={{ gap: 2 }}>
      <SectionLabel style={{ letterSpacing: 2 }}>Режим Кавовара</SectionLabel>
      <Heading size={22} accessibilityRole="header">
        {cafeName}
      </Heading>
    </View>
  );
}

export interface ScanWorkstationProps {
  /** The Café every scan is issued at. */
  cafeId: string;
  /** Top of the screen: the owner's role header, or the shift banner (#80). */
  header: ReactNode;
  /** Bottom of the screen: leave the screen (owner's «Назад», shift's exit). */
  exit: ReactNode;
}

/**
 * The counter workstation (#20, #21, #22): camera on the Customer's rotating
 * QR, typed member-code fallback, held outcome, Redemption confirm. One
 * component because the shift's Scanner Mode (#80) IS the owner's scan screen
 * — same two powers, only the frame (header/exit) differs.
 *
 * The redesign (turn 2) renders it in the theme chosen in Settings → ВИГЛЯД,
 * like Customer Mode: every scan screen was drawn in both themes (2a–2l).
 */
export function ScanWorkstation({
  cafeId,
  header,
  exit,
}: ScanWorkstationProps) {
  const t = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const { state, onScanned, onMemberCode, confirmRedemption, scanNext } =
    useScanPurchase(cafeId);
  // The offline fallback (#21): what has been typed of the Customer's member
  // code, and the local malformed-input message (server rejections take the
  // same "rejected" path a bad scan does).
  const [typedCode, setTypedCode] = useState("");
  const [typedCodeError, setTypedCodeError] = useState<string | null>(null);

  function submitTypedCode() {
    const normalized = normalizeMemberCode(typedCode);
    if (!isWellFormedMemberCode(normalized)) {
      setTypedCodeError("Код — 8 літер і цифр, наприклад K7Q4-M2ZX");
      return;
    }
    setTypedCodeError(null);
    setTypedCode("");
    void onMemberCode(normalized);
  }

  if (!permission) {
    return (
      <Screen header={header}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={t.c.foreground} />
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen header={header}>
        <Muted style={{ textAlign: "left" }}>
          Щоб сканувати QR-код клієнта, потрібен доступ до камери.
        </Muted>
        <Button
          title="Дозволити камеру"
          onPress={() => void requestPermission()}
        />
        <View style={{ flex: 1 }} />
        {exit}
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      {state.phase === "scanning" && (
        <>
          <Viewfinder onBarcodeScanned={(data) => void onScanned(data)} />
          {/* The offline fallback (#21): a failed scan never dead-ends the
              sale — type the member code from beneath the Customer's QR. */}
          <TextField
            testID="scan.member-code-input"
            value={typedCode}
            onChangeText={setTypedCode}
            placeholder="Або введи код клієнта"
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={submitTypedCode}
            style={{ minHeight: 48 }}
          />
          {typedCodeError && <ErrorText>{typedCodeError}</ErrorText>}
          {typedCode.length > 0 && (
            <Button
              title="Нарахувати за кодом"
              variant="secondary"
              testID="scan.accrue-by-code"
              onPress={submitTypedCode}
            />
          )}
        </>
      )}

      {(state.phase === "sending" || state.phase === "confirming") && (
        <ActivityIndicator color={t.c.foreground} />
      )}

      {state.phase === "issued" && (
        <IssuedOutcome
          result={state.result}
          confirmError={state.confirmError}
          onConfirm={() => void confirmRedemption()}
        />
      )}

      {state.phase === "redeemed" && (
        <RedeemedOutcome
          result={state.result}
          beansSpent={state.redemption.beansSpent}
          reward={state.redemption.reward}
          confirmError={state.confirmError}
          onConfirmAgain={() => void confirmRedemption()}
        />
      )}

      {state.phase === "rejected" && (
        <StatusStrip
          testID="scan.rejected"
          intent="danger"
          {...rejectionCopy(state.code, state.message)}
        />
      )}

      <View style={{ flex: 1 }} />

      {state.phase === "scanning" ? (
        exit
      ) : state.phase === "issued" ||
        state.phase === "redeemed" ||
        state.phase === "rejected" ? (
        <Button
          title="Сканувати ще"
          // Demoted to secondary whenever the outcome already shows an in-card
          // primary confirm (2d reward-ready, or a banked re-offer) — one screen,
          // one primary CTA. Otherwise (2c/2e/2f) it is the primary action.
          variant={hasInCardConfirm(state) ? "secondary" : "primary"}
          testID="scan.next"
          onPress={scanNext}
        />
      ) : null}
    </Screen>
  );
}

/**
 * Whether the held outcome renders its own primary confirm inside a card — the
 * reward-ready confirm (2d) or a banked re-offer (2e). When it does, the bottom
 * «Сканувати ще» steps down to secondary so the confirm stays the lone primary.
 */
function hasInCardConfirm(state: ScanState): boolean {
  return (
    (state.phase === "issued" || state.phase === "redeemed") &&
    canRedeem(state.result)
  );
}

/** Side of one corner bracket, and how far the brackets sit in from the well edge. */
const CORNER = 34;
const CORNER_INSET = 16;
// The bottom brackets stop well above the edge (2a) so the in-frame hint sits in
// the clear strip beneath them rather than colliding with the brackets.
const CORNER_INSET_BOTTOM = 64;
const CORNER_STROKE = 3;
const CORNER_RADIUS = 6;

/** One gold L-bracket at a corner of the viewfinder (decorative, aria-hidden). */
function Corner({ at }: { at: "tl" | "tr" | "bl" | "br" }) {
  const t = useTheme();
  const edge: Record<typeof at, object> = {
    tl: {
      top: CORNER_INSET,
      left: CORNER_INSET,
      borderTopWidth: CORNER_STROKE,
      borderLeftWidth: CORNER_STROKE,
      borderTopLeftRadius: CORNER_RADIUS,
    },
    tr: {
      top: CORNER_INSET,
      right: CORNER_INSET,
      borderTopWidth: CORNER_STROKE,
      borderRightWidth: CORNER_STROKE,
      borderTopRightRadius: CORNER_RADIUS,
    },
    bl: {
      bottom: CORNER_INSET_BOTTOM,
      left: CORNER_INSET,
      borderBottomWidth: CORNER_STROKE,
      borderLeftWidth: CORNER_STROKE,
      borderBottomLeftRadius: CORNER_RADIUS,
    },
    br: {
      bottom: CORNER_INSET_BOTTOM,
      right: CORNER_INSET,
      borderBottomWidth: CORNER_STROKE,
      borderRightWidth: CORNER_STROKE,
      borderBottomRightRadius: CORNER_RADIUS,
    },
  };
  return (
    <View
      aria-hidden
      style={[
        {
          position: "absolute",
          width: CORNER,
          height: CORNER,
          borderColor: t.c.primary,
        },
        edge[at],
      ]}
    />
  );
}

/**
 * The camera well (2a/2b): a full-width square on a dark surface — `secondary`
 * indigo in light, near-black in dark — with gold corner brackets, a horizontal
 * scan line, and the in-frame hint. The brackets and line are pure decoration
 * (aria-hidden); the hint carries the instruction.
 */
function Viewfinder({
  onBarcodeScanned,
}: {
  onBarcodeScanned: (data: string) => void;
}) {
  const t = useTheme();
  const wellBg =
    t.themeName === "dark" ? t.color.secondary[950] : t.c.secondary;
  return (
    <View
      testID="scan.viewfinder"
      style={{
        alignSelf: "stretch",
        aspectRatio: 1,
        borderRadius: t.radius.lg,
        overflow: "hidden",
        backgroundColor: wellBg,
      }}
    >
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => onBarcodeScanned(data)}
      />
      <Corner at="tl" />
      <Corner at="tr" />
      <Corner at="bl" />
      <Corner at="br" />
      <View
        aria-hidden
        style={{
          position: "absolute",
          left: 24,
          right: 24,
          top: "48%",
          height: 2,
          borderRadius: 1,
          backgroundColor: t.c.primary,
          opacity: 0.85,
        }}
      />
      <Text
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 18,
          textAlign: "center",
          fontSize: 13.5,
          fontFamily: fontFamily.body.semibold,
          color: t.color.neutral[100],
        }}
      >
        Наведи камеру на QR-код клієнта
      </Text>
    </View>
  );
}

/** The neutral surface behind the 2c balance progress. */
function ProgressCard({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        alignSelf: "stretch",
        backgroundColor: t.c.surface,
        borderWidth: 1,
        borderColor: t.c.border,
        borderRadius: t.radius.lg,
        paddingVertical: 16,
        paddingHorizontal: 18,
        gap: 10,
      }}
    >
      {children}
    </View>
  );
}

/**
 * The held Purchase outcome (2c/2d): a success strip, then either the balance
 * progress (2c) or — when the balance now covers a Reward — the confirm card
 * that is the screen (2d).
 */
function IssuedOutcome({
  result,
  confirmError,
  onConfirm,
}: {
  result: PurchaseResult;
  confirmError?: string;
  onConfirm: () => void;
}) {
  const t = useTheme();
  const ready = canRedeem(result);
  return (
    <>
      <StatusStrip
        testID="scan.issued"
        intent="success"
        title={
          ready
            ? `Зернятко зараховано · ${result.customerName}`
            : "Зернятко зараховано"
        }
        // The ritual moved to the Customer's device (turn 1, 1k): the counter is
        // only told it is waiting there — the fortune text is not shown here.
        detail={
          ready ? undefined : `${result.customerName} · Ворожка вже на екрані`
        }
      />
      {ready ? (
        <RewardConfirmCard
          result={result}
          confirmError={confirmError}
          onConfirm={onConfirm}
        />
      ) : (
        <ProgressCard>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontFamily: fontFamily.body.bold,
                color: t.c.foreground,
              }}
            >
              Зернятка
            </Text>
            <Text
              style={{
                fontSize: 16,
                fontFamily: fontFamily.body.semibold,
                color: t.c["text-secondary"],
              }}
            >
              {result.balance} з {result.threshold}
            </Text>
          </View>
          <BeanRow balance={result.balance} threshold={result.threshold} />
        </ProgressCard>
      )}
    </>
  );
}

/**
 * The reward-ready confirm card (2d): gold-bordered `shadow.reward` surface that
 * states the ledger math before the confirm, so the barista sees exactly what
 * the tap spends. `balance ≥ threshold` here, so `result` carries a Reward.
 */
function RewardConfirmCard({
  result,
  confirmError,
  onConfirm,
}: {
  result: PurchaseResult & { reward: Reward };
  confirmError?: string;
  onConfirm: () => void;
}) {
  const t = useTheme();
  const saved = result.balance - result.threshold;
  return (
    <View
      testID="scan.reward-ready"
      style={[
        {
          alignSelf: "stretch",
          backgroundColor: t.c.surface,
          borderWidth: 1.5,
          borderColor: t.c.primary,
          borderRadius: t.radius.lg,
          paddingVertical: 18,
          paddingHorizontal: 18,
          gap: 10,
        },
        toShadowStyle(t.shadow.reward),
      ]}
    >
      <SectionLabel style={{ fontSize: 13, color: t.c.link }}>
        <Text aria-hidden>★ </Text>
        Винагорода готова · {result.balance} з {result.threshold}
      </SectionLabel>
      <Heading size={22}>{rewardLabel(result.reward)}</Heading>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 20,
          fontFamily: fontFamily.body.regular,
          color: t.c["text-secondary"],
        }}
      >
        Підтверди — спишеться {result.threshold}{" "}
        {pluralizeUk(result.threshold, BEAN_FORMS)}, {saved} збережеться
      </Text>
      <Button
        title="Видати Винагороду"
        testID="scan.confirm-redemption"
        onPress={onConfirm}
      />
      {confirmError && <ErrorText>{confirmError}</ErrorText>}
    </View>
  );
}

/**
 * The redeemed outcome (2e): a `primary-surface` card narrating what was spent
 * and the remaining balance. A banked balance (≥ 2× threshold) still covers a
 * Reward, so it re-offers a confirm — its own spend, its own key.
 */
function RedeemedOutcome({
  result,
  beansSpent,
  reward,
  confirmError,
  onConfirmAgain,
}: {
  result: PurchaseResult;
  beansSpent: number;
  reward: Reward;
  confirmError?: string;
  onConfirmAgain: () => void;
}) {
  const t = useTheme();
  return (
    <>
      <View
        testID="scan.redeemed"
        accessible
        accessibilityLiveRegion="polite"
        style={{
          alignSelf: "stretch",
          alignItems: "center",
          gap: 6,
          backgroundColor: t.c["primary-surface"],
          borderWidth: 1,
          borderColor: t.c.primary,
          borderRadius: t.radius.lg,
          paddingVertical: 22,
          paddingHorizontal: 18,
        }}
      >
        <Berehynia size={22} color={t.c.link} />
        <Heading size={22} style={{ textAlign: "center" }}>
          Винагороду видано
        </Heading>
        <Text
          style={{
            fontSize: 15,
            fontFamily: fontFamily.body.semibold,
            color: t.c["text-secondary"],
            textAlign: "center",
          }}
        >
          {rewardLabel(reward)} · {result.customerName}
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontFamily: fontFamily.body.regular,
            color: t.c["text-muted"],
            textAlign: "center",
          }}
        >
          −{beansSpent} {pluralizeUk(beansSpent, BEAN_FORMS)} · залишок{" "}
          {result.balance} з {result.threshold}
        </Text>
      </View>
      {canRedeem(result) && (
        <Button
          title="Видати ще одну"
          testID="scan.confirm-redemption-again"
          onPress={onConfirmAgain}
        />
      )}
      {confirmError && <ErrorText>{confirmError}</ErrorText>}
    </>
  );
}
