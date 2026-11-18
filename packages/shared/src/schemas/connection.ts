/**
 * Connection metadata schema — shared across all verticals.
 */
import { z } from 'zod'
import { SYNC_MODES } from '../data-store/sync-schedule'

export const ConnectionStatusSchema = z.enum([
  'valid',
  'expiring_soon',
  'expired',
  'platform_error',
])
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>

export const ConnectionSchema = z.object({
  /** Stable connection UUID. Wire format: `connection_id`. */
  id: z.string().uuid().meta({ example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90' }),
  platform: z.string().meta({ example: 'stripe' }),
  /** Absent for adapters that don't use multi-tenant OAuth (e.g. API-key adapters). */
  tenantId: z.string().nullable().optional().meta({ example: 'acme' }),
  /** Optional human-readable label, e.g. "Acme Prod Fortnox". Unique per (platform, tenantId). */
  label: z.string().nullable().optional().meta({ example: 'Acme Industries' }),
  /**
   * - `valid`          — usable: either the access token is live, or it has
   *                      lapsed and the grant has already proven it can renew
   *                      it (access-token expiry is auto-managed, so an idle
   *                      connection is not a broken one)
   * - `expiring_soon`  — token expires within 5 minutes (will auto-refresh on next request)
   * - `expired`        — a human must act: the refresh grant is dead and the
   *                      CUSTOMER must re-authorize, or the token lapsed with
   *                      no evidence the connection can renew it
   * - `platform_error` — the platform's OAuth client credentials were rejected
   *                      (invalid_client); the OPERATOR must fix the client id/secret.
   *                      Customer re-authorization will not help.
   */
  status: ConnectionStatusSchema.meta({ example: 'valid' }),
  /** ISO 8601. Absent when the adapter uses non-expiring tokens (API keys, etc.). */
  expiresAt: z.string().nullable().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  createdAt: z.string().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.string().meta({ example: '2026-02-01T14:20:00Z' }),
  /**
   * How often the connection's data is re-synced: `default` (the deployment
   * interval), `custom` (every `syncIntervalMinutes`), `trigger_only` (only when
   * a sync is requested — never automatically, not even when connected) or
   * `once` (one sync when connected).
   */
  syncMode: z.enum(SYNC_MODES).optional().meta({ example: 'default' }),
  /** Minutes between syncs for a `custom` schedule; null otherwise. */
  syncIntervalMinutes: z.number().int().nullable().optional().meta({ example: null }),
})
export type Connection = z.infer<typeof ConnectionSchema>

/** Body schema for PATCH /connections/:connectionId */
export const UpdateConnectionBodySchema = z.object({
  label: z.string().nullable().optional().meta({ example: 'Acme Industries' }),
  tenant_id: z.string().nullable().optional().meta({ example: 'acme' }),
})
export type UpdateConnectionBody = z.infer<typeof UpdateConnectionBodySchema>

const EXPIRING_SOON_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Compute a connection's surface status. Two signals feed in:
 *
 * 1. `expiresAt` — the access-token TTL.
 * 2. `lastRefreshStatus` — the outcome of the last refresh attempt.
 *    `'expired'` means the refresh grant itself died (`invalid_grant` /
 *    `unauthorized_client`) and the customer must re-authorize.
 *
 * `expired` is reserved for "a human must act". An access token that has
 * simply lapsed between uses is not that: they are short (Fortnox's live one
 * hour) and renewed automatically, so a healthy idle connection spends much of
 * its life with a dead access token and a perfectly good grant behind it.
 * Reporting that as `expired` — the same word used for a dead grant — would
 * leave an operator unable to tell an idle connection from one needing
 * customer action.
 *
 * Renewability is inferred from evidence already persisted rather than by
 * decrypting the credential blob on every list request: a connection that has
 * refreshed successfully at least once demonstrably holds a working refresh
 * token. Anything weaker keeps the conservative reading — never refreshed
 * (an api-key-style connection looks exactly like this) or last attempt failed
 * (a recurring transient failure is a real outage) both still read `expired`.
 *
 * Callers that pass just a number carry no refresh evidence, so a lapsed
 * access token reads as `expired`.
 */
export function computeStatus(
  arg:
    | number
    | null
    | undefined
    | {
        expiresAt: number | null | undefined
        lastRefreshStatus?: 'ok' | 'failed' | 'expired' | 'platform_error' | null
      },
): ConnectionStatus {
  const expiresAt = typeof arg === 'object' && arg !== null ? arg.expiresAt : arg
  const lastRefreshStatus =
    typeof arg === 'object' && arg !== null ? arg.lastRefreshStatus : undefined
  // Hard refresh outcomes win over access-token expiry math (which auto-manages).
  if (lastRefreshStatus === 'platform_error') return 'platform_error'
  if (lastRefreshStatus === 'expired') return 'expired'
  if (!expiresAt) return 'valid'
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) {
    // Lapsed access token. Only a previously successful refresh proves the
    // grant can renew it; without that, this still needs a human.
    return lastRefreshStatus === 'ok' ? 'valid' : 'expired'
  }
  if (remaining <= EXPIRING_SOON_MS) return 'expiring_soon'
  return 'valid'
}
