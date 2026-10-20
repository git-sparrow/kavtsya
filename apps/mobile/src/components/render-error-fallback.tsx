import { useRouter, type ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { StatusStrip } from "@/components/status-strip";
import { reportRenderError } from "@/lib/report-render-error";
import { useTheme } from "@/theme";

/**
 * What a route shows instead of itself when rendering it threw (#216): the
 * standard danger strip and a retry, inside the usual `Screen`. Only for
 * render-phase errors; a failed read or action keeps its own `StatusStrip` on
 * the screen that made it.
 *
 * `retry` re-renders the same subtree, so a deterministic bug just throws
 * again. The copy therefore offers another try without promising it works, and
 * `onBack` gives a way off the broken screen that does not depend on it.
 */
export function RenderErrorFallback({
  error,
  retry,
  onBack,
}: ErrorBoundaryProps & { onBack?: () => void }) {
  const t = useTheme();

  useEffect(() => {
    reportRenderError(error);
  }, [error]);

  return (
    <Screen>
      <StatusStrip
        intent="danger"
        title="Не вдалося показати цей екран"
        detail={
          onBack
            ? "Можна спробувати ще раз. Якщо не вийде, повернись назад."
            : "Можна спробувати ще раз. Якщо не вийде, перезапусти застосунок."
        }
        testID="render-error"
      />
      <View style={{ alignSelf: "stretch", gap: t.space[1] }}>
        <Button
          title="Спробувати знову"
          variant="secondary"
          onPress={() => void retry()}
          testID="render-error-retry"
        />
        {onBack ? (
          <Button
            title="Назад"
            variant="quiet"
            onPress={onBack}
            testID="render-error-back"
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
      onBack={router.canGoBack() ? () => router.back() : undefined}
    />
  );
}
