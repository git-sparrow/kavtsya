export const BRAND = "Кавця";

export const CONTROLLER =
  "Кавця (Kavtsya) розробляє та підтримує Олександр Горобець (Oleksandr Horobets)";

export const CONTACT_EMAIL = "hello@kavtsya.com";

export const POLICY_EFFECTIVE_DATE = "6 листопада 2026 року";

export const BACKUP_RETENTION = "{{BACKUP_RETENTION}}";

export interface StoreListing {
  store: string;
  url: string | null;
}

export const STORE_LISTINGS: readonly StoreListing[] = [
  { store: "App Store", url: null },
  { store: "Google Play", url: null },
];

export const PAGES = {
  home: { path: "/", title: "Головна" },
  privacy: { path: "/privacy/", title: "Політика конфіденційності" },
  deleteAccount: { path: "/delete-account/", title: "Видалення акаунта" },
  support: { path: "/support/", title: "Підтримка" },
} as const;
