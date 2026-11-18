/**
 * The "upstream" for a simulated sandbox sync: seed a couple of fresh
 * fixture rows per top-level resource type, so a developer who polls a list
 * after their sync completes genuinely sees new records — the observable
 * effect a real warm-up sync has.
 *
 * Singleton and parent-scoped specs are counted but not grown: a singleton
 * has exactly one row by definition, and child rows only make sense stamped
 * with a parent id, which `ensureSeeded` already handles at read time. For
 * those the reported `synced` count is what a fresh pull would have listed —
 * the rows the tenant already holds.
 */
import { buildFixture, type SandboxStore } from '@opensteward/shared'
import { sandboxSpecsFor } from './manifest'

/** New rows added per top-level resource type on each simulated sync. */
const NEW_ROWS_PER_SYNC = 2

function seedKey(tenantId: string, vertical: string, resourceType: string): string {
  return `${tenantId}|${vertical}|${resourceType}`
}

/** Mirrors adapter.ts's fixtureId: index 0 keeps the documented id. */
function fixtureId(record: Record<string, unknown>, resourceType: string, index: number): string {
  const own = record['id']
  const base = typeof own === 'string' && own.length > 0 ? own : `sbx_${resourceType}`
  return index === 0 ? base : `${base}_${index}`
}

export function createSandboxSyncSimulator(
  store: SandboxStore,
  vertical: string,
): (tenantId: string) => Promise<Record<string, number>> {
  return async (tenantId) => {
    const counts: Record<string, number> = {}
    for (const spec of sandboxSpecsFor(vertical)) {
      const existing = await store.list(tenantId, vertical, spec.resourceType)
      if (spec.singletonId || spec.parent) {
        counts[spec.resourceType] = existing.length
        continue
      }
      // Continue the id sequence adapter.ts's seeding started, so the new
      // rows are recognisably siblings (`inv_1042_3`, `inv_1042_4`, …) and a
      // repeat sync keeps extending rather than overwriting.
      const startIndex = existing.length
      const rows = Array.from({ length: NEW_ROWS_PER_SYNC }, (_, i) => {
        const index = startIndex + i
        const data = buildFixture(spec.schema, {
          seed: seedKey(tenantId, vertical, spec.resourceType),
          index,
        })
        const id = fixtureId(data, spec.resourceType, index)
        return { id, data: { ...data, id } }
      })
      await store.upsertMany(tenantId, vertical, spec.resourceType, rows)
      counts[spec.resourceType] = existing.length + rows.length
    }
    return counts
  }
}
