/**
 * Shared types for public-dataset adapters.
 *
 * Every adapter converts a vendor-specific file into a stream of
 * NormalizedEntry objects that the ingestion script can consume
 * uniformly.
 */

/** A single row ready for the ingestion pipeline. */
export interface NormalizedEntry {
  /** The journal-like text content. */
  text: string
  /** Simulated self-report mood (1-10). */
  moodProxy: number
  /** Original label from the source dataset. */
  diagnosticCategory: string
  /**
   * Deterministic synthetic user id.
   * Adapters should partition rows so each user gets 50-200 entries,
   * which satisfies the ridge-regression minimum of 10 labeled days.
   */
  syntheticUserId: string
}

/** Every dataset adapter implements this contract. */
export interface DatasetAdapter {
  /** Human-readable name shown in CLI output. */
  name: string
  /** Async generator that yields NormalizedEntry rows from the file at `filePath`. */
  load(filePath: string): AsyncGenerator<NormalizedEntry>
}
