import type { FastifyInstance } from 'fastify'
import { requireAuth, requireRole } from '../auth/middleware'
import { flashSuccess } from '../flash'
import type { AdminApiClient, NotificationRow } from '../proxy/admin-api-client'

/**
 * The most the badge will spell out. Past two digits the number stops meaning
 * anything a glance can use — 1,204 unread is "many", and the page is where
 * to go — and a wider badge would push the header's other controls around.
 */
export const UNREAD_BADGE_CAP = 99

/**
 * Notification types the bell does not count — the admin UI's mirror of the
 * exclusion `GET /api/notifications/unread-count` applies in SQL, kept so the
 * /notifications page can say how many of the rows it lists the bell is not
 * counting. The set must match admin-api's, or the page's arithmetic drifts.
 *
 * `credential_expiring` is raised while a token sits inside its refresh window
 * and re-raised every five minutes for as long as it stays there — and a token
 * in that window refreshes itself. Counting it makes the badge permanent, and
 * a badge that is never zero says nothing. The row still shows on the page.
 */
const NOT_COUNTED_TYPES: ReadonlySet<string> = new Set(['credential_expiring'])

/** How many of `rows` the bell counts, by admin-api's rule. */
export function unreadNotificationCount(rows: readonly NotificationRow[]): number {
  return rows.filter((n) => !NOT_COUNTED_TYPES.has(n.type)).length
}

/**
 * The badge text for an exact count: the number, or `99+` past the cap. The
 * count is admin-api's and exact, so there is no "unknown" here — that is the
 * caller's `null`, for when admin-api could not be asked at all.
 */
export function formatUnreadCount(count: number): string {
  return count > UNREAD_BADGE_CAP ? `${UNREAD_BADGE_CAP}+` : String(count)
}

export function createNotificationsRoutes(apiClient: AdminApiClient) {
  return async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireAuth)

    fastify.get('/notifications', async (request, reply) => {
      const token = request.sessionUser!.token
      // The page's own read: the bell's preHandler asks admin-api for a
      // count, not for rows, so nothing upstream has fetched these.
      const notifications = await apiClient.listNotifications(token)
      return reply.view('notifications.ejs', {
        user: request.sessionUser,
        notifications,
        unreadCount: unreadNotificationCount(notifications),
      })
    })

    // Acknowledging clears the notice for everyone, so it is an action, not a
    // preference — the same rule as every other write: operator or above.
    fastify.post<{ Params: { id: string } }>(
      '/notifications/:id/acknowledge',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        await apiClient.acknowledgeNotification(token, parseInt(request.params.id, 10))
        flashSuccess(reply, 'Notification dismissed.')
        return reply.redirect('/notifications')
      },
    )

    fastify.post(
      '/notifications/acknowledge-all',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        await apiClient.acknowledgeAll(token)
        flashSuccess(reply, 'All notifications dismissed.')
        // Back to the (now empty) list rather than the dashboard: the operator
        // was on this page, and the flash lands where the action was taken.
        return reply.redirect('/notifications')
      },
    )
  }
}
