/**
 * Shared connection resolution — finds the target connection for a request.
 *
 * Both accounting and logistics use the same pattern:
 *   1. If ?connection_id is provided, look up by UUID
 *   2. If ?platform is provided, find by platform (+ optional tenant)
 *   3. Return found/none/ambiguous result
 */
import type { ConnectionRow, CredentialStore } from './store'

export type ConnectionResolution =
  | { kind: 'found'; row: ConnectionRow }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: ConnectionRow[] }

/**
 * Resolve the target connection for a request.
 *
 * @param store - The credential store
 * @param connectionId - ?connection_id query param (UUID)
 * @param platform - ?platform query param
 * @param tenantId - tenant ID (from header or query)
 */
export async function resolveConnection(
  store: CredentialStore,
  connectionId: string | undefined,
  platform: string | undefined,
  tenantId: string | null | undefined,
): Promise<ConnectionResolution> {
  // Strategy 1: direct lookup by connection_id
  if (connectionId) {
    const row = await store.getRow(connectionId)
    if (row) return { kind: 'found', row }
    // Try legacy ID fallback
    const legacy = await store.findByLegacyId?.(connectionId)
    if (legacy) return { kind: 'found', row: legacy }
    return { kind: 'none' }
  }

  // Strategy 2: lookup by platform + optional tenant
  if (platform) {
    const candidates = await store.findByPlatformTenant(platform, tenantId)
    if (candidates.length === 1) return { kind: 'found', row: candidates[0] }
    if (candidates.length === 0) return { kind: 'none' }
    return { kind: 'ambiguous', candidates }
  }

  return { kind: 'none' }
}
