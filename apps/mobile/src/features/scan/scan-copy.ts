import type { ScanRejection } from "@kavtsya/shared";

/** A rejected scan's counter-facing copy: a bold title + an optional recovery line. */
export interface RejectionCopy {
  title: string;
  detail?: string;
}

/**
 * The scanner's rejected-state copy (2f/2k), keyed by the shared #50 scan-
 * rejection taxonomy so it is a compile error to add a rejection reason without
 * counter-facing copy. Written in the «ти» voice like the rest of the redesign;
 * the title names what happened, the detail tells the barista how to recover.
 * A self-scan is the rule itself — no recovery, so no detail.
 */
export const SCAN_REJECTION_COPY: Record<ScanRejection, RejectionCopy> = {
  expired_token: {
    title: "Код застарів",
    detail: "Попроси клієнта оновити екран із QR — код живе 90 секунд",
  },
  token_used: {
    title: "Код уже використано",
    detail: "Попроси клієнта оновити екран",
  },
  invalid_token: {
    title: "Це не QR-код Кавці",
    detail: "Переконайся, що скануєш код клієнта із застосунку",
  },
  unknown_member_code: {
    title: "Клієнта не знайдено",
    detail: "Перевір код і спробуй ще",
  },
  self_scan: {
    title: "Не можна сканувати власний код",
  },
  own_cafe: {
    title: "Це твоя кав'ярня",
    detail: "У власній кав'ярні зернятка не нараховуються",
  },
  not_found: {
    title: "Кав'ярню не знайдено",
    detail: "Спробуй ще раз або перезайди в застосунок",
  },
  manual_limit_reached: {
    title: "Ліміт на сьогодні вичерпано",
    detail: "Цьому клієнту вже нараховано максимум за кодом сьогодні",
  },
};

/**
 * The copy to show for a rejected scan: the taxonomy's two-line copy when the
 * server named a #50 code, otherwise the raw error message as a single title
 * (a transport failure the barista can only retry).
 */
export function rejectionCopy(
  code: ScanRejection | null,
  message: string,
): RejectionCopy {
  return code ? SCAN_REJECTION_COPY[code] : { title: message };
}
