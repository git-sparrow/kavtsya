import type {
  Notification,
  NotificationBehavior,
  NotificationHandler,
} from "expo-notifications";
import { expect, it, vi } from "vitest";

const setNotificationHandler = vi.fn<(h: NotificationHandler | null) => void>();
vi.mock("expo-notifications", () => ({ setNotificationHandler }));

const { initForegroundNotifications } =
  await import("../src/features/push/foreground-notifications");

it("shows a foreground notification as a banner with sound that stays in Notification Center", async () => {
  initForegroundNotifications();

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
