import * as Notifications from "expo-notifications";

/**
 * Without a handler, expo-notifications drops a notification that arrives while
 * the app is open (#418). Call once at app start, before any can arrive.
 * `shouldPlaySound` matters beyond sound: Android drops the banner down only
 * when it is true (`NotificationBehavior` docs, expo-notifications 57.0.23).
 * The badge stays off because pushes carry no count.
 */
export function initForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
