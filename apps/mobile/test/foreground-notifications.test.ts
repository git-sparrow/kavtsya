import type {
  Notification,
  NotificationBehavior,
  NotificationHandler,
} from "expo-notifications";
import { expect, it, vi } from "vitest";

/**
 * A push that arrives while the app is open shows the same way it does in the
 * background (#418): banner, Notification Center, and sound, which Android needs
 * before it drops the banner down.
 */

const setNotificationHandler = vi.fn<(h: NotificationHandler | null) => void>();
vi.mock("expo-notifications", () => ({ setNotificationHandler }));

const { showForegroundNotifications } =
  await import("../src/features/push/foreground-notifications");

it("shows a foreground notification as a banner with sound that stays in Notification Center", async () => {
  showForegroundNotifications();

  expect(setNotificationHandler).toHaveBeenCalledOnce();
  const handler = setNotificationHandler.mock.calls[0]![0]!;
  const behavior = await handler.handleNotification({} as Notification);
  expect(behavior).toEqual<NotificationBehavior>({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  });
});
