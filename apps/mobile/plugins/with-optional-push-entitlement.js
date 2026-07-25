const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * Drops the iOS `aps-environment` entitlement when `KAVTSYA_NO_PUSH=1`.
 *
 * `expo-notifications` ships an auto-applied config plugin that always writes
 * `aps-environment` into the entitlements. That asks Apple for the Push
 * Notifications capability at signing time, and a *personal* (free) Apple team
 * cannot be granted it — so `expo run:ios --device` fails to create any
 * provisioning profile at all, and every other capability goes down with it:
 *
 *   Personal development teams … do not support the Push Notifications capability.
 *   No profiles for 'com.kavtsya.app' were found.
 *
 * Setting KAVTSYA_NO_PUSH=1 trades remote push away for a device build that
 * signs on a free team. Nothing else changes: `registerDeviceForPush` is
 * already fire-and-forget and no-ops wherever a token can't be minted, and the
 * server re-checks consent at every send (#24).
 *
 * Leave the flag unset for EAS builds and anywhere a paid team signs — push
 * must stay intact there.
 */
const withOptionalPushEntitlement = (config) => {
  if (process.env.KAVTSYA_NO_PUSH !== "1") return config;

  // Registered after the autolinked expo-notifications plugin, so this mod runs
  // last and wins.
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults["aps-environment"];
    return config;
  });
};

module.exports = withOptionalPushEntitlement;
