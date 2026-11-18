/**
 * Unified connections admin router — a single global view of every stored
 * connection across every vertical.
 *
 *   GET    /connections              List, optional ?vertical= / ?platform= filters
 *   GET    /connections/{id}         Single
 *   PATCH  /connections/{id}         Rename label
 *   PUT    /connections/{id}/sync-schedule   Set the connection's sync schedule
 *   DELETE /connections/{id}         Revoke (does NOT call platform to revoke tokens)
 *
 * Protected by `X-Admin-Secret` (see admin-guard).
 */
import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify'
import { CredentialStore, DuplicateLabelError, type ConnectionRow } from '../auth/store'
import { computeStatus } from '../schemas/connection'
import {
  parseSyncMode,
  SyncScheduleSchema,
  type ConnectionSyncState,
  type SyncStateResolver,
} from '../data-store/sync-schedule'
import { adminGuard } from './admin-guard'

/** Decorate a stored ConnectionRow with the derived `status` field that
 *  consumers (admin-api HealthPoller, admin UI) read. Status combines the
 *  access-token TTL with the keep-alive worker's `lastRefreshStatus`, so an
 *  authorization that died via `invalid_grant` shows as `expired` even if
 *  the cached access-token expiry is still in the future. */
function withStatus(
  row: ConnectionRow,
): ConnectionRow & { status: ReturnType<typeof computeStatus> } {
  return {
    ...row,
    status: computeStatus({ expiresAt: row.expiresAt, lastRefreshStatus: row.lastRefreshStatus }),
  }
}

type DecoratedRow = ConnectionRow & {
  status: ReturnType<typeof computeStatus>
  sync: ConnectionSyncState | null
}

/** Rows as the admin routes send them: derived `status`, plus `sync` — the
 *  schedule's state as the scheduler sees it — or null in passthrough mode,
 *  where nothing syncs. One history read per call, however many rows.
 *
 *  `syncMode` goes out as the scheduler reads it (`parseSyncMode`), so a
 *  hand-edited mode reads `default` instead of reaching admin-api's response
 *  enum, which would fail the whole connections list there.
 *
 *  A failed sync-state read never fails the call: the rows go out with
 *  `sync: null` and the failure is logged. The connections were read (after
 *  a write, the write has committed), and admin-api turns a 500 on the list
 *  into an empty connections page. */
async function decorate(
  rows: ConnectionRow[],
  syncState: SyncStateResolver | undefined,
  log: FastifyBaseLogger,
): Promise<DecoratedRow[]> {
  let states: Map<string, ConnectionSyncState> | null = null
  if (syncState && rows.length > 0) {
    try {
      states = await syncState(rows)
    } catch (err) {
      log.warn(
        { err },
        rows.length === 1
          ? `connection ${rows[0]!.id}: sync state unavailable`
          : `sync state unavailable for ${rows.length} connections`,
      )
    }
  }
  return rows.map((row) => ({
    ...withStatus(row),
    syncMode: parseSyncMode(row.syncMode),
    sync: states?.get(row.id) ?? null,
  }))
}

const decorateOne = async (
  row: ConnectionRow,
  syncState: SyncStateResolver | undefined,
  log: FastifyBaseLogger,
): Promise<DecoratedRow> => (await decorate([row], syncState, log))[0]!

export interface UnifiedConnectionsRouterOptions {
  store: CredentialStore
  /** Present when the data store is on; see `createSyncStateResolver`. */
  syncState?: SyncStateResolver
}

interface ListQuery {
  vertical?: string
  platform?: string
}

interface PatchBody {
  label?: string | null
}

export function createUnifiedConnectionsRouter(
  opts: UnifiedConnectionsRouterOptions,
): FastifyPluginAsync {
  const { store, syncState } = opts

  return async (fastify) => {
    fastify.get<{ Querystring: ListQuery }>('/connections', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const all = await store.list()
      const filtered = all.filter((row) => {
        if (request.query.vertical && row.vertical !== request.query.vertical) return false
        if (request.query.platform && row.platform !== request.query.platform) return false
        return true
      })
      return reply.send({
        data: await decorate(filtered, syncState, request.log),
        meta: { totalCount: filtered.length, fetchedAt: new Date().toISOString() },
      })
    })

    fastify.get<{ Params: { id: string } }>('/connections/:id', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const row = await store.getRow(request.params.id)
      if (!row) {
        return reply.status(404).send({
          error: {
            code: 'CONNECTION_NOT_FOUND',
            message: `No connection with id ${request.params.id}.`,
          },
        })
      }
      return reply.send({
        data: await decorateOne(row, syncState, request.log),
        meta: { fetchedAt: new Date().toISOString() },
      })
    })

    fastify.patch<{ Params: { id: string }; Body: PatchBody }>(
      '/connections/:id',
      async (request, reply) => {
        if (!adminGuard(request, reply)) return reply
        const body = request.body ?? {}
        if (!('label' in body)) {
          return reply.status(400).send({
            error: {
              code: 'MISSING_LABEL',
              message: "Body must include 'label' (string or null to clear).",
            },
          })
        }
        const next = body.label
        if (next !== null && typeof next !== 'string') {
          return reply.status(400).send({
            error: { code: 'INVALID_LABEL', message: "'label' must be a string or null." },
          })
        }
        let updated: ConnectionRow
        try {
          updated = await store.updateMetadata(request.params.id, { label: next })
        } catch (err) {
          if (err instanceof DuplicateLabelError) {
            return reply.status(409).send({
              error: { code: 'DUPLICATE_LABEL', message: err.message },
            })
          }
          if (err instanceof Error && /not found/i.test(err.message)) {
            return reply.status(404).send({
              error: { code: 'CONNECTION_NOT_FOUND', message: err.message },
            })
          }
          throw err
        }
        // Decorated like the GET above: a PATCH reply that dropped `status`
        // made a rename look like it had invalidated the connection to
        // anything re-rendering from the response. Outside the try, because
        // the rename has committed: nothing past here may report it failed.
        return reply.send({
          data: await decorateOne(updated, syncState, request.log),
          meta: { fetchedAt: new Date().toISOString() },
        })
      },
    )

    fastify.put<{ Params: { id: string }; Body: unknown }>(
      '/connections/:id/sync-schedule',
      async (request, reply) => {
        if (!adminGuard(request, reply)) return reply
        const parsed = SyncScheduleSchema.safeParse(request.body ?? {})
        if (!parsed.success) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_SYNC_SCHEDULE',
              message: parsed.error.issues.map((i) => i.message).join(' '),
              issues: parsed.error.issues,
            },
          })
        }
        const updated = await store.updateSyncSchedule(request.params.id, parsed.data)
        if (!updated) {
          return reply.status(404).send({
            error: {
              code: 'CONNECTION_NOT_FOUND',
              message: `No connection with id ${request.params.id}.`,
            },
          })
        }
        return reply.send({
          data: await decorateOne(updated, syncState, request.log),
          meta: { fetchedAt: new Date().toISOString() },
        })
      },
    )

    fastify.delete<{ Params: { id: string } }>('/connections/:id', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const ok = await store.deleteById(request.params.id)
      if (!ok) {
        return reply.status(404).send({
          error: {
            code: 'CONNECTION_NOT_FOUND',
            message: `No connection with id ${request.params.id}.`,
          },
        })
      }
      return reply.status(204).send()
    })
  }
}
