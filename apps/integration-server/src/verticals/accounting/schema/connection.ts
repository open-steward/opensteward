import { z } from 'zod'

export const ConnectionStatusSchema = z.enum(['valid', 'expiring_soon', 'expired', 'platform_error'])
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>

export const ConnectionSchema = z.object({
  /** Stable connection UUID. Wire format: `connection_id`. */
  id: z.string().uuid(),
  platform: z.string(),
  /** Absent for adapters that don't use multi-tenant OAuth (e.g. API-key adapters). */
  tenantId: z.string().nullable().optional(),
  /** Optional human-readable label, e.g. "Acme Prod Fortnox". Unique per (platform, tenantId). */
  label: z.string().nullable().optional(),
  /**
   * - `valid`          — token is present and not expiring within 5 minutes
   * - `expiring_soon`  — token expires within 5 minutes (will auto-refresh on next request)
   * - `expired`        — refresh grant is dead; the customer must re-authorize
   * - `platform_error` — the platform's OAuth client credentials were rejected
   *                      (invalid_client); the operator must fix the client id/secret
   */
  status: ConnectionStatusSchema,
  /** ISO 8601. Absent when the adapter uses non-expiring tokens (API keys, etc.). */
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Connection = z.infer<typeof ConnectionSchema>

/** Body schema for PATCH /connections/:connectionId */
export const UpdateConnectionBodySchema = z.object({
  label: z.string().nullable().optional(),
  tenant_id: z.string().nullable().optional(),
})
export type UpdateConnectionBody = z.infer<typeof UpdateConnectionBodySchema>

const EXPIRING_SOON_MS = 5 * 60 * 1000 // 5 minutes

export function computeStatus(expiresAt: number | null | undefined): ConnectionStatus {
  if (!expiresAt) return 'valid'
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return 'expired'
  if (remaining <= EXPIRING_SOON_MS) return 'expiring_soon'
  return 'valid'
}
