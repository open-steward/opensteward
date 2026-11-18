/**
 * Inbound-webhook cache refresh — the consumer's `refreshResource` hook.
 *
 * Given one verified event (vertical, platform, connection, resourceType,
 * resourceId, action), refresh exactly that row in the data-store cache:
 *   - delete-like actions → ResourceStore.delete. When the event's body was
 *                           not authenticated, the platform is asked instead:
 *                           the row is evicted only on a confirmed 404
 *   - otherwise           → adapter.get<Resource>(creds, id) → ResourceStore.upsert
 *                           (a re-read through the API, so the body is only a hint)
 *
 * Targeted (one resource), not a full re-sync. Best-effort: every miss is a
 * no-op (unknown vertical/slug, no get-method, missing creds, empty id). The
 * keep-alive worker keeps stored creds fresh, so we use them as-is.
 */
import type {
  CredentialStore,
  ResourceStore,
  RefreshResourceFn,
  UnifiedAdapterRegistry,
} from '@opensteward/shared'

const DELETE_ACTIONS = new Set(['deleted', 'cancelled', 'voided', 'removed', 'expired'])

/** An adapter get that failed because the platform says the record is gone. */
function isNotFound(err: unknown): boolean {
  const e = err as { statusCode?: unknown; response?: { status?: unknown } } | null
  return e?.statusCode === 404 || e?.response?.status === 404
}

export interface RefreshResourceDeps {
  registry: UnifiedAdapterRegistry
  resourceStore: ResourceStore
  store: CredentialStore
  /** vertical → (resourceType slug → adapter get-method name). */
  refreshMaps: Record<string, Record<string, string>>
  logger?: { warn: (...a: unknown[]) => void }
}

export function createRefreshResource(deps: RefreshResourceDeps): RefreshResourceFn {
  return async ({
    vertical,
    platform,
    connectionId,
    tenantId,
    resourceType,
    resourceId,
    action,
    bodyAuthenticated,
  }) => {
    if (!resourceType || resourceType === 'unknown' || !resourceId) return

    // A delete taken from an unauthenticated body (the proof covered only the
    // sender, as with Zoho Desk's X-ZDesk-JWT) is not trusted as such: a
    // replayed token with a forged body could otherwise evict any cached row.
    // It falls through to the re-read below, which evicts only on a 404.
    const untrustedBody = bodyAuthenticated === false
    if (DELETE_ACTIONS.has(action) && !untrustedBody) {
      await deps.resourceStore.delete(vertical, platform, tenantId, resourceType, resourceId)
      return
    }

    const method = deps.refreshMaps[vertical]?.[resourceType]
    if (!method) return

    const adapter = deps.registry.get(vertical, platform) as
      (Record<string, unknown> & object) | undefined
    const fn = adapter?.[method]
    if (typeof fn !== 'function') return

    const creds = await deps.store.loadById(connectionId)
    if (!creds) return

    let data: unknown
    try {
      data = await (fn as (c: unknown, id: string) => Promise<unknown>).call(
        adapter,
        creds,
        resourceId,
      )
    } catch (err) {
      if (untrustedBody && isNotFound(err)) {
        await deps.resourceStore.delete(vertical, platform, tenantId, resourceType, resourceId)
        return
      }
      throw err
    }
    await deps.resourceStore.upsert(vertical, platform, tenantId, resourceType, resourceId, data)
  }
}
