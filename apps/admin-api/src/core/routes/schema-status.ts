/**
 * GET /api/schema-status — per-namespace `_schema_migrations` rows for
 * the shared database this admin-api process owns. Developer diagnostics,
 * proxied by the admin UI at its own `/api/schema-status`: the System page
 * does not show these rows, because migrations apply at boot and fail closed
 * (packages/shared/src/db/migrate.ts), so a running service has applied its
 * own and the rows answer nothing an operator asks.
 *
 * Admin role only — schema state isn't a secret but it's diagnostic
 * detail that has no business being exposed to operator / viewer.
 *
 * Rows are read off the shared `DbHandle` (the same connection the
 * stores use) and grouped per namespace; a namespace with no applied
 * migrations simply doesn't appear.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AdminStore } from '../db/admin-store'
import { SchemaStatusEntry as SchemaStatusEntrySchema, listEnvelope, errorBody } from './_openapi'

const TAG = 'schema-status'

interface SchemaMigrationRowDb {
  namespace: string
  version: number
  applied_at: number
}

/** Response-shape row: camelCase `appliedAt` (the DB column stays `applied_at`). */
interface SchemaMigrationRowResponse {
  namespace: string
  version: number
  appliedAt: number
}

export interface SchemaStatusEntry {
  /** Logical database/namespace name, e.g. `admin_store`. */
  db: string
  /** Logical database/namespace name (kept for wire-shape compatibility). */
  path: string
  /** Per-namespace rows, sorted by version. Empty when the namespace has no rows. */
  rows: SchemaMigrationRowResponse[]
  /** Set when migration rows are present for the namespace. */
  exists: boolean
}

export function createSchemaStatusRoutes(adminStore: AdminStore) {
  return async function schemaStatusRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)
    fastify.addHook('preHandler', fastify.adminOnly)

    fastify.get(
      '/api/schema-status',
      {
        schema: {
          tags: [TAG],
          summary: 'Per-namespace _schema_migrations rows for every reachable SQLite db',
          description:
            'Report the applied `_schema_migrations` rows for each SQLite database this admin-api can reach, grouped by namespace. Admin role required (diagnostic detail not exposed to operator/viewer). Developer diagnostics: migrations apply when each service starts and a failed one stops the boot, so a running service has applied its own. A missing db file is reported as an empty row set rather than an error.',
          operationId: 'schema-status.list',
          response: {
            200: listEnvelope(SchemaStatusEntrySchema),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async () => {
        const handle = adminStore.getHandle()
        const dbRows = (await handle.kysely
          .selectFrom('_schema_migrations')
          .select(['namespace', 'version', 'applied_at'])
          .execute()) as SchemaMigrationRowDb[]

        // Group rows per namespace, preserving the camelCase wire field.
        const byNamespace = new Map<string, SchemaMigrationRowResponse[]>()
        for (const r of dbRows) {
          const rows = byNamespace.get(r.namespace) ?? []
          rows.push({ namespace: r.namespace, version: r.version, appliedAt: r.applied_at })
          byNamespace.set(r.namespace, rows)
        }

        const data: SchemaStatusEntry[] = [...byNamespace.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([namespace, rows]) => ({
            db: namespace,
            path: namespace,
            rows: rows.sort((a, b) => a.version - b.version),
            exists: true,
          }))

        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )
  }
}
