/**
 * The AIProvider abstraction (ADR 0007): Ворожка's seam to any live model.
 * One method for v1 — the daily batch of generic fortunes. Concrete providers
 * (Claude today, others later) implement it; everything else in the codebase
 * depends only on this interface, so tests substitute a fake and never make a
 * network call, and swapping providers is an env change (see `createAIProvider`).
 */
export interface AIProvider {
  /** Generate `count` short Ukrainian coffee fortunes. */
  generateFortunes(count: number): Promise<string[]>;
}
