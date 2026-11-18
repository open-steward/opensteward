/**
 * LISTABLE_RESOURCES — the (resourceType, adapter method) pairs the background
 * sync worker iterates over when fulfilling a sync job.
 *
 * Note: signers, documents, and audit_trail_entries are envelope-scoped on
 * every platform, so the sync worker fans out from the envelope list. They
 * are excluded from the top-level listable set because the worker would not
 * know which envelope to scope to.
 */
export const LISTABLE_RESOURCES: Array<{ resourceType: string; method: string }> = [
  { resourceType: 'envelopes', method: 'listEnvelopes' },
  { resourceType: 'templates', method: 'listTemplates' },
]
