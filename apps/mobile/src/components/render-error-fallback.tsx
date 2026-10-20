import {
  useFocusEffect,
  useRouter,
  type ErrorBoundaryProps,
} from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";

import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { StatusStrip } from "@/components/status-strip";
import { reportRenderError } from "@/lib/report-render-error";
import { useTheme } from "@/theme";

/** A way off the broken screen that does not depend on it. */
interface Escape {
  label: string;
  /** The second sentence of the strip's detail, naming the escape. */
  hint: string;
  onPress: () => void;
}

/**
 * What a route shows instead of itself when rendering it threw (#216): the
 * standard danger strip and a retry, inside the usual `Screen`. Only for
 * render-phase errors; a failed read or action keeps its own `StatusStrip` on
 * the screen that made it.
 *
 * `retry` re-renders the same subtree, so a deterministic bug just throws
 * again. The copy therefore offers another try without promising it works, and
 * `escape` names a way off the broken screen where the route has one.
 */
export function RenderErrorFallback({
  error,
  retry,
  escape,
}: ErrorBoundaryProps & { escape?: Escape }) {
  const t = useTheme();

  useEffect(() => {
    reportRenderError(error);
  }, [error]);

  return (
    <Screen>
      <StatusStrip
        intent="danger"
        title="Не вдалося показати цей екран"
        detail={`Можна спробувати ще раз. ${
          escape?.hint ?? "Якщо не вийде, перезапусти застосунок."
        }`}
        testID="render-error"
      />
      <View style={{ alignSelf: "stretch", gap: t.space[1] }}>
        <Button
          title="Спробувати знову"
          variant="secondary"
          onPress={() => void retry()}
          testID="render-error-retry"
        />
        {escape ? (
          <Button
            title={escape.label}
            variant="quiet"
            onPress={escape.onPress}
            testID="render-error-escape"
          />
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * The boundary every screen route exports. It sits inside its navigator, so
 * the rest of the stack survives the error, and when there is a screen beneath
 * it «Назад» leaves the broken one.
 */
export function ScreenErrorBoundary(props: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <RenderErrorFallback
      {...props}
      escape={
        router.canGoBack()
          ? {
              label: "Назад",
              hint: "Якщо не вийде, повернись назад.",
              onPress: () => router.back(),
            }
          : undefined
      }
    />
  );
}

/**
 * The boundary for the signed-in landing, which renders whichever Mode the
 * account derives to and has nothing beneath it to go back to. Settings is the
 * way out: it holds the Mode switch and sign-out, so a CafeOwner whose Mode
 * surface throws can still reach their Customer Mode.
 *
 * Coming back to the landing retries it, so returning from a Mode switch shows
 * the new Mode rather than this card. The first focus is the mount itself and
 * is skipped, so a throw that recurs leaves the card up instead of looping.
 */
export function LandingErrorBoundary(props: ErrorBoundaryProps) {
  const router = useRouter();
  const { retry } = props;
  const hasLeft = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (hasLeft.current) void retry();
      return () => {
        hasLeft.current = true;
      };
    }, [retry]),
  );

  return (
    <RenderErrorFallback
      {...props}
      escape={{
        label: "Налаштування",
        hint: "Якщо не вийде, відкрий налаштування.",
        onPress: () => router.push("/settings"),
      }}
    />
  );
}
