import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AdminStore } from '../db/admin-store'
import { denyRestrictedScope, getAccess, isRestricted } from '../auth/access'
import {
  Notification,
  UnreadNotificationCount,
  dataEnvelope,
  listEnvelope,
  errorBody,
  noContent,
} from './_openapi'

const TAG = 'notifications'

const IdParam = z.object({ id: z.string() })

export function createNotificationsRoutes(adminStore: AdminStore) {
  return async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    fastify.get(
      '/api/notifications',
      {
        schema: {
          tags: [TAG],
          summary: 'List unacknowledged notifications',
          description:
            'List notifications that have not yet been acknowledged (e.g. connection errors or sync alerts surfaced to operators). Any authenticated operator. A tenant-restricted user gets none (notifications are not tenant-scoped yet).',
          operationId: 'notifications.list',
          response: {
            200: listEnvelope(Notification),
            401: errorBody,
          },
        },
      },
      async (request) => {
        // Notifications are not tenant-scoped yet (they name any tenant's
        // connection): a restricted user sees none, rather than a 403 that
        // would break the bell on every page.
        if (isRestricted(await getAccess(request))) {
          return { data: [], meta: { page: 1, limit: 0, total: 0 } }
        }
        // Map the internal snake_case store rows to the camelCase response
        // shape. The sqlite columns stay snake_case; only the wire shape changes.
        const data = (await adminStore.listUnacknowledged()).map((row) => ({
          id: row.id,
          type: row.type,
          vertical: row.vertical,
          connectionId: row.connection_id,
          platform: row.platform,
          message: row.message,
          acknowledged: row.acknowledged,
          createdAt: row.created_at,
        }))
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.get(
      '/api/notifications/unread-count',
      {
        schema: {
          tags: [TAG],
          summary: 'Count unread notifications',
          description:
            'The number of unacknowledged notifications, excluding `credential_expiring` (it auto-heals within a poll, so counting it would keep the header bell from ever reading zero). Any authenticated operator. A tenant-restricted user gets none (notifications are not tenant-scoped yet).',
          operationId: 'notifications.unread-count',
          response: {
            200: dataEnvelope(UnreadNotificationCount),
            401: errorBody,
          },
        },
      },
      async (request) => {
        if (isRestricted(await getAccess(request))) return { data: { count: 0 } }
        return {
          data: {
            count: await adminStore.countUnacknowledged({ excludeTypes: ['credential_expiring'] }),
          },
        }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api/notifications/:id/acknowledge',
      {
        preHandler: [fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Acknowledge a single notification',
          description:
            'Mark a single notification as acknowledged so it drops out of the unacknowledged list. Operator role or higher. Returns `404` if no notification matches the id. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant.',
          operationId: 'notifications.acknowledge',
          params: IdParam,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const ok = await adminStore.acknowledgeNotification(parseInt(request.params.id, 10))
        if (!ok) return reply.status(404).send({ error: 'Notification not found' })
        return reply.status(204).send()
      },
    )

    fastify.post(
      '/api/notifications/acknowledge-all',
      {
        preHandler: [fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Acknowledge every notification',
          description:
            'Acknowledge every outstanding notification in one call, clearing the unacknowledged list. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant.',
          operationId: 'notifications.acknowledge-all',
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (_request, reply) => {
        await adminStore.acknowledgeAll()
        return reply.status(204).send()
      },
    )
  }
}
