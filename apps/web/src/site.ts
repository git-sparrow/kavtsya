export const BRAND = "Кавця";

export const CONTROLLER = `${BRAND} (Kavtsya) розробляє та підтримує Олександр Горобець (Oleksandr Horobets)`;

export const CONTACT_EMAIL = "hello@kavtsya.com";

export const POLICY_EFFECTIVE_DATE = "6 листопада 2026 року";

const BACKUP_RETENTION = "{{BACKUP_RETENTION}}";

export const BACKUP_NOTE = `Видалені дані лишаються в резервних копіях бази даних ще до ${BACKUP_RETENTION}, доки Railway не замінить їх новими копіями.`;

export const SENTRY_RETENTION =
  "Звіти про збої Sentry зберігає 30 днів на нашому поточному безкоштовному плані і 90 днів на платному.";

interface StoreListing {
  store: string;
  url: string | null;
}

export const STORE_LISTINGS: readonly StoreListing[] = [
  { store: "App Store", url: null },
  { store: "Google Play", url: null },
];

export const PAGES = {
  home: { path: "/" },
  privacy: { path: "/privacy/", title: "Політика конфіденційності" },
  deleteAccount: { path: "/delete-account/", title: "Видалення акаунта" },
  support: { path: "/support/", title: "Підтримка" },
} as const;
