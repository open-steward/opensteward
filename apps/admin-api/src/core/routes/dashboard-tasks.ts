/**
 * Dashboard task dismissals — the admin-api half of clearing a row on the
 * dashboard's "Needs attention" panel.
 *
 * A clear is deployment-wide and clear-once (the notification-ack rule: it
 * is an action, not a preference). Each row is keyed by the task key and a
 * fingerprint the dashboard derives from live data, so the task stays hidden
 * only while the condition is unchanged; a re-auth, a fresh rejection or a
 * new job id changes the fingerprint and the task re-surfaces. The storage
 * shape and the fingerprint format are documented on `DashboardDismissal`
 * in `db/admin-store.ts`.
 *
 * Clearing also acknowledges the notification the health poller raised for
 * the same condition — `credential_expired` by connection id,
 * `platform_credentials_invalid` by vertical/platform — so one clear settles
 * both surfaces; the poller honours the dismissal and will not re-raise it.
 *
 * Routes:
 *   GET    /api/dashboard-tasks/dismissals       — list (auth)
 *   POST   /api/dashboard-tasks/dismissals       — clear 1..50 tasks (operator;
 *                                                   admin for platform:creds/wizard)
 *   DELETE /api/dashboard-tasks/dismissals/:key  — undo one clear (same floor)
 *
 * The role floor is per key (`minRoleForDashboardTask`): the UI hop hides
 * the Clear control from operators on admin-only rows, and this hop refuses
 * the write outright so a direct API call cannot settle a task — and its
 * notification — that only an admin can act on.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { DASHBOARD_TASK_KEY_RE, minRoleForDashboardTask, type AdminStore } from '../db/admin-store'
import { callerContext, denyRestrictedScope, getAccess, isRestricted, tenantAllowed } from '../auth/access'
import type { UnifiedClient } from '../proxy/client'
import { DashboardDismissal, dataEnvelope, errorBody, noContent } from './_openapi'

const TAG = 'dashboard-tasks'

const TaskKey = z.string().regex(DASHBOARD_TASK_KEY_RE).meta({
  description:
    'Task key: `conn:expired:<connectionId>`, `platform:creds:<vertical>/<platform>`, `sync:failed:<jobId>`, `refresh:failing:<connectionId>` or `wizard:<step>`. A `vertical:down:*` row is not clearable and is refused.',
  example: 'conn:expired:conn_1042',
})

const DismissItem = z
  .object({
    key: TaskKey,
    fingerprint: z.string().max(300).meta({
      description:
        'Fingerprint of the condition being cleared, as derived by the dashboard (ISO 8601 for timestamps, empty when the key alone identifies it). The task re-surfaces when the live fingerprint differs.',
      example: '2026-09-01T00:00:00.000Z',
    }),
  })
  .meta({ id: 'DashboardDismissItem', description: 'One dashboard task to clear.' })

const DismissBody = z
  .object({
    items: z
      .array(DismissItem)
      .min(1)
      .max(50)
      .meta({
        description: 'Tasks to clear (1..50). Re-clearing a key replaces its fingerprint.',
        example: [{ key: 'conn:expired:conn_1042', fingerprint: '2026-09-01T00:00:00.000Z' }],
      }),
  })
  .meta({ id: 'DismissDashboardTasksBody', description: 'Request body to clear dashboard tasks.' })

const KeyParam = z.object({
  key: TaskKey.meta({
    description: 'Task key to un-clear (URL-encode it: keys contain `:` and may contain `/`).',
    example: 'conn:expired:conn_1042',
  }),
})

export function createDashboardTasksRoutes(adminStore: AdminStore, client?: UnifiedClient) {
  return async function dashboardTasksRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    fastify.get(
      '/api/dashboard-tasks/dismissals',
      {
        schema: {
          tags: [TAG],
          summary: 'List cleared dashboard tasks',
          description:
            'Every dashboard task that has been cleared, with the fingerprint it was cleared at. The dashboard hides a task only when both the key and the fingerprint match. Any authenticated operator. A tenant-restricted user sees only the keys whose connection or sync job is inside their scope.',
          operationId: 'dashboard-tasks.list-dismissals',
          response: { 200: dataEnvelope(z.array(DashboardDismissal)), 401: errorBody },
        },
      },
      async (request) => {
        const rows = await adminStore.listDashboardDismissals()
        const access = await getAccess(request)
        if (!isRestricted(access)) return { data: rows }
        // Keys embed connection and sync-job ids, which name other tenants'
        // rows: a restricted caller gets only keys whose id is inside its scope.
        // Keys with no id (`platform:*`, `wizard:*`) are deployment-wide.
        const cache = new Map<string, boolean>()
        const inScope = async (kind: 'conn' | 'job', id: string): Promise<boolean> => {
          const k = `${kind}:${id}`
          const hit = cache.get(k)
          if (hit !== undefined) return hit
          let ok = false
          try {
            const row = client
              ? ((kind === 'conn' ? await client.getConnection(id) : await client.getSyncJob(id)) as {
                  tenantId?: string | null
                  vertical?: string | null
                } | null)
              : null
            ok = !!row && tenantAllowed(access, row.tenantId, row.vertical)
          } catch {
            ok = false // fail closed
          }
          cache.set(k, ok)
          return ok
        }
        const data: typeof rows = []
        for (const row of rows) {
          const m = /^(?:conn:expired|refresh:failing):(.+)$/.exec(row.key)
          const j = /^sync:failed:(.+)$/.exec(row.key)
          if (m ? await inScope('conn', m[1]!) : j ? await inScope('job', j[1]!) : true) data.push(row)
        }
        return { data }
      },
    )

    fastify.post<{ Body: z.infer<typeof DismissBody> }>(
      '/api/dashboard-tasks/dismissals',
      {
        preHandler: [fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Clear dashboard tasks',
          description:
            'Clear 1..50 dashboard tasks deployment-wide. Also acknowledges the matching unacknowledged notifications (`credential_expired` for `conn:expired:*`, `platform_credentials_invalid` for `platform:creds:*`), and the health poller will not re-raise them while the fingerprint is unchanged. Operator role or higher; Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. `platform:creds:*` and `wizard:*` keys need the admin role, and one such key in the batch makes the whole request `403` with nothing stored. Writes a `dashboard_task.dismiss` audit entry.',
          operationId: 'dashboard-tasks.dismiss',
          body: DismissBody,
          response: { 204: noContent, 400: errorBody, 401: errorBody, 403: errorBody },
        },
      },
      async (request, reply) => {
        const items = request.body.items
        if (
          !(await allowedForKeys(
            request,
            reply,
            items.map((i) => i.key),
          ))
        )
          return
        await adminStore.dismissDashboardTasks(items, request.jwtUser!.id)
        for (const item of items) {
          const match = notificationMatchFor(item.key)
          if (match) await adminStore.acknowledgeNotificationsMatching(match)
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'dashboard_task.dismiss',
          detail: { keys: items.map((i) => i.key), count: items.length },
        })
        return reply.status(204).send()
      },
    )

    fastify.delete<{ Params: { key: string } }>(
      '/api/dashboard-tasks/dismissals/:key',
      {
        preHandler: [fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Un-clear a dashboard task',
          description:
            'Remove one clear so the task shows on the dashboard again (the Undo behind a clear). Operator role or higher; Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. `platform:creds:*` and `wizard:*` keys need the admin role (`403` otherwise). Returns `404` when the key was not cleared. Writes a `dashboard_task.undismiss` audit entry.',
          operationId: 'dashboard-tasks.undismiss',
          params: KeyParam,
          response: {
            204: noContent,
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const key = request.params.key
        if (!(await allowedForKeys(request, reply, [key]))) return
        if (!(await adminStore.undismissDashboardTask(key))) {
          return reply.status(404).send({ error: 'Dashboard task was not cleared' })
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'dashboard_task.undismiss',
          targetId: key,
        })
        return reply.status(204).send()
      },
    )
  }
}

/**
 * Per-key role floor on top of `operatorOnly`: sends `403` and returns false
 * when any key needs a role the caller does not hold. All-or-nothing, so a
 * mixed batch never stores its operator-level half.
 */
async function allowedForKeys(
  request: FastifyRequest,
  reply: FastifyReply,
  keys: readonly string[],
): Promise<boolean> {
  // The current role from the database, not the sign-in token's claim.
  if ((await callerContext(request)).baseRole === 'admin') return true
  const denied = keys.find((k) => minRoleForDashboardTask(k) === 'admin')
  if (!denied) return true
  void reply.status(403).send({ error: `Clearing \`${denied}\` needs the admin role` })
  return false
}

/**
 * The notification a task key stands for, in `acknowledgeNotificationsMatching`
 * terms — or null when the kind has no notification (`sync:failed`,
 * `refresh:failing`, `wizard`).
 */
export function notificationMatchFor(
  key: string,
): { type: string; connectionId?: string; vertical?: string; platform?: string } | null {
  const conn = /^conn:expired:(.+)$/.exec(key)
  if (conn) return { type: 'credential_expired', connectionId: conn[1]! }
  const creds = /^platform:creds:([^/]+)\/(.+)$/.exec(key)
  if (creds)
    return { type: 'platform_credentials_invalid', vertical: creds[1]!, platform: creds[2]! }
  return null
}
