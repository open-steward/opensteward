/**
 * Built-in metrics over deployment state rather than one resource type. The
 * engine computes each by id (`runSystem` in `engine.ts`), from the sync
 * store, the credential store and the resource store — always narrowed to
 * the connections the caller may see.
 */
import type { SystemMetricDefinition } from '../types'

export const SYSTEM_METRICS: readonly SystemMetricDefinition[] = [
  {
    id: 'system.records_per_vertical',
    title: 'Stored records per vertical',
    description: 'Records in the data store for the connections you can see, by vertical.',
    kind: 'breakdown',
  },
  {
    id: 'system.sync_outcomes_per_day',
    title: 'Sync job outcomes per day',
    description:
      'Background sync jobs created per day (or week, or month), one series per outcome.',
    kind: 'timeseries',
  },
  {
    id: 'system.data_freshness',
    title: 'Data freshness',
    description:
      'Per connection: stored records, the newest change and when its last full collection finished.',
    kind: 'table',
  },
  {
    id: 'system.records_per_resource',
    title: 'Stored records per resource',
    description:
      'Records in the data store for the connections you can see, per vertical and resource type.',
    kind: 'breakdown',
  },
  {
    id: 'system.sync_success_rate',
    title: 'Sync success rate',
    description:
      'Completed ÷ (completed + failed) of the sync jobs created in the period. Pending and running jobs are not counted.',
    kind: 'ratio',
    unit: 'percent',
    snapshot: false,
    granular: true,
    thresholds: { warn: 95, crit: 85, direction: 'below' },
  },
  {
    id: 'system.sync_failures_by_platform',
    title: 'Sync failures by platform',
    description:
      'Failed sync jobs created in the period per platform, with each platform’s job count and failure rate.',
    kind: 'breakdown',
    snapshot: false,
  },
  {
    id: 'system.sync_duration',
    title: 'Sync duration (seconds)',
    description:
      'Seconds from start to finish of the sync jobs completed in the period: median, mean and 90th percentile, overall and per platform.',
    kind: 'duration',
    unit: 'index',
    snapshot: false,
    charts: ['number', 'histogram', 'boxplot', 'table'],
  },
  {
    id: 'system.connections_by_status',
    title: 'Connections by status',
    description:
      'Connections you can see, by state of the last credential refresh: ok, refresh failing, re-authorisation needed, platform error, or expired token.',
    kind: 'breakdown',
    charts: ['donut', 'bar', 'hbar', 'pie', 'table'],
  },
  {
    id: 'system.token_expiring_soon',
    title: 'Tokens expiring soon',
    description:
      'Connections whose token expires within 7 days (or already has) and was not renewed by the last refresh attempt.',
    kind: 'table',
  },
  {
    id: 'system.stale_connections',
    title: 'Stale connections',
    description:
      'Connections by time since their last full collection finished (under a day, 1–3 days, 3–7 days, over 7 days, never); the table lists those older than 3 days.',
    kind: 'breakdown',
    charts: ['bar', 'hbar', 'donut', 'table'],
  },
  {
    id: 'system.sync_error_types',
    title: 'Sync error types',
    description:
      'Errors of the sync jobs created in the period, sorted into reviewed classes (timeout, auth 401/403, rate limit 429, upstream 5xx, not provided by platform, other). Skipped resources ("not provided by platform") count too. Raw error text is never shown.',
    kind: 'breakdown',
    snapshot: false,
    charts: ['bar', 'hbar', 'donut', 'pie', 'table'],
  },
]

/**
 * The classes `system.sync_error_types` sorts an error message into. A
 * reviewed, closed list: only the class name ever leaves the server, never
 * the message (an upstream body can echo credentials). First match wins, so
 * the order matters: a 504 "Gateway Timeout" is a timeout, a 429 whose body
 * says "Unauthorized" is still a rate limit.
 */
export const SYNC_ERROR_CLASSES: ReadonlyArray<{ label: string; test: RegExp }> = [
  { label: 'Not provided by platform', test: /^not provided by\b|\bNOT_SUPPORTED\b/i },
  { label: 'Timeout', test: /\btimed?[ -]?out\b|\btimeout\b|\bETIMEDOUT\b|\bESOCKETTIMEDOUT\b|deadline exceeded/i },
  {
    label: 'Rate limit (429)',
    test: /\breturned 429\b|status code 429\b|rate[ -]?limit|too many requests|throttl/i,
  },
  {
    label: 'Auth (401/403)',
    test: /\breturned 40[13]\b|status code 40[13]\b|unauthori[sz]ed|forbidden|invalid[_ ]grant|invalid[_ ]token|insufficient[_ ]scope/i,
  },
  {
    label: 'Upstream 5xx',
    test: /\breturned 5\d\d\b|status code 5\d\d\b|bad gateway|service unavailable|internal server error|circuit breaker is open|temporarily unavailable/i,
  },
]
export const SYNC_ERROR_OTHER = 'Other'

/** The reviewed class of an error message; only this ever leaves the server. */
export function classifySyncError(message: string): string {
  for (const c of SYNC_ERROR_CLASSES) if (c.test.test(message)) return c.label
  return SYNC_ERROR_OTHER
}

/** Hours of collection age past which a connection is listed as stale. */
export const STALE_AFTER_HOURS = 72
/** Days ahead of expiry a token is listed. */
export const TOKEN_EXPIRY_DAYS = 7
