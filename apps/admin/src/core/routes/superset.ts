/**
 * Embedded Apache Superset dashboards (optional).
 *
 *   GET  /dashboards/superset/:id              the dashboard, embedded by public/js/superset-embed.js
 *   POST /dashboards/superset/:id/guest-token  JSON: a guest token for it (CSRF-protected)
 *   GET  /dashboards/superset/:id/sharing      who sees it, and pinned tenants (dashboards:share_all)
 *   POST /dashboards/superset/:id/sharing      save that                        (dashboards:share_all)
 *
 * The browser never calls admin-api or asks Superset for a token itself:
 * superset-embed.js loads the vendored embedded SDK
 * (`/vendor/superset-embedded-sdk.js`), which frames Superset's `/embedded/<uuid>`
 * page and asks `fetchGuestToken` for a token — that POSTs here, with the page's
 * CSRF token, and this proxies admin-api's `POST /api/analytics/superset/guest-token`
 * with the session's JWT. The token admin-api returns carries the operator's
 * tenant scope as row-level security, so the embedded charts show only their
 * tenants.
 *
 * Every page is served with the strict CSP from `../csp.ts`, plus `frame-src`
 * for the Superset origin admin-api reports (`SUPERSET_PUBLIC_URL`) on the
 * dashboard page only. The dashboards index lists these dashboards under
 * "Custom dashboards (Superset)" when the feature is on (`routes/dashboards.ts`).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hasPermission, requirePermission } from '../auth/middleware'
import { cspOrigin, useStrictCsp } from '../csp'
import { flashSuccess } from '../flash'
import type { AdminApiClient } from '../proxy/admin-api-client'
import { audienceLabel, dataFromLabel, sharingFromForm, tenantChoices } from './dashboards'

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the Superset page handler: the origin its CSP may frame. */
    supersetFrameOrigin?: string | null
  }
}

function apiError(
  err: unknown,
  fallback = 'The dashboard could not be authorised.',
): { status: number; code: string | null; message: string } {
  const e = err as { response?: { status?: number; data?: { error?: unknown } } }
  const status = e?.response?.status
  const raw = e?.response?.data?.error
  const code =
    raw && typeof raw === 'object' && 'code' in raw ? String((raw as { code: unknown }).code) : null
  const message =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && 'message' in raw
        ? String((raw as { message: unknown }).message)
        : fallback
  return { status: status && status >= 400 && status < 600 ? status : 502, code, message }
}

export function createSupersetRoutes(apiClient: AdminApiClient) {
  return async function supersetRoutes(fastify: FastifyInstance): Promise<void> {
    useStrictCsp(fastify, { frameSrc: (request) => request.supersetFrameOrigin })
    fastify.addHook('preHandler', requirePermission('dashboards:view'))

    function notFound(request: FastifyRequest, reply: FastifyReply, message: string) {
      return reply.status(404).view('error.ejs', {
        user: request.sessionUser,
        status: 404,
        message,
        requestId: null,
      })
    }

    const OFF_MESSAGE = 'Embedded Superset dashboards are not set up on this deployment.'

    /** Superset configured on this deployment? Best-effort, like the index page. */
    async function supersetOn(token: string): Promise<boolean> {
      const status = await apiClient.getSupersetStatus(token)
      return Boolean(status?.enabled)
    }

    async function findDashboard(token: string, id: string) {
      return (await apiClient.listSupersetDashboards(token)).find((d) => d.id === id) ?? null
    }

    fastify.get<{ Params: { id: string } }>('/dashboards/superset/:id', async (request, reply) => {
      const token = request.sessionUser!.token
      const status = await apiClient.getSupersetStatus(token)
      const origin = cspOrigin(status?.publicUrl)
      if (!status?.enabled || !origin) {
        return notFound(
          request,
          reply,
          'Embedded Superset dashboards are not set up on this deployment.',
        )
      }
      const dashboards = await apiClient.listSupersetDashboards(token)
      const dashboard = dashboards.find((d) => d.id === request.params.id)
      if (!dashboard) {
        return notFound(request, reply, 'No such dashboard, or it is not available to you.')
      }
      request.supersetFrameOrigin = origin
      const tenants = await apiClient.listTenants(token)
      const names = new Map(tenants.map((t) => [t.id, t.name]))
      return reply.view('dashboards/superset.ejs', {
        user: request.sessionUser,
        dashboard,
        audienceText: audienceLabel(dashboard.audience, names),
        dataFrom: dataFromLabel(dashboard.pinnedTenants, request.sessionUser!.scope, names),
        canShareAll:
          hasPermission(request.sessionUser, 'dashboards:share_all') &&
          request.sessionUser?.scope?.mode !== 'restricted',
        supersetDomain: status.publicUrl!.replace(/\/+$/, ''),
        title: dashboard.title,
      })
    })

    fastify.get<{ Params: { id: string } }>(
      '/dashboards/superset/:id/sharing',
      { preHandler: requirePermission('dashboards:share_all') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        if (!(await supersetOn(token))) return notFound(request, reply, OFF_MESSAGE)
        const dashboard = await findDashboard(token, request.params.id)
        if (!dashboard) {
          return notFound(request, reply, 'No such dashboard, or it is not available to you.')
        }
        const tenants = await apiClient.listTenants(token)
        return reply.view('dashboards/superset-sharing.ejs', {
          user: request.sessionUser,
          dashboard,
          sharing: { audience: dashboard.audience, pinnedTenants: dashboard.pinnedTenants },
          tenantChoices: tenantChoices(
            tenants,
            dashboard.audience.kind === 'tenants' ? dashboard.audience.tenants : null,
            dashboard.pinnedTenants,
          ),
          error: null,
          title: `Sharing — ${dashboard.title}`,
        })
      },
    )

    fastify.post<{ Params: { id: string }; Body: Record<string, string | string[] | undefined> }>(
      '/dashboards/superset/:id/sharing',
      { preHandler: requirePermission('dashboards:share_all') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        if (!(await supersetOn(token))) return notFound(request, reply, OFF_MESSAGE)
        const sharing = sharingFromForm(request.body ?? {})
        try {
          await apiClient.updateSupersetSharing(token, request.params.id, sharing)
          flashSuccess(reply, 'Sharing saved.')
          return reply.redirect(`/dashboards/superset/${encodeURIComponent(request.params.id)}`)
        } catch (err) {
          const e = apiError(err, 'Could not save sharing.')
          const dashboard = await findDashboard(token, request.params.id).catch(() => null)
          if (!dashboard) {
            return notFound(request, reply, 'No such dashboard, or it is not available to you.')
          }
          const tenants = await apiClient.listTenants(token)
          return reply
            .status(e.status >= 400 && e.status < 500 ? e.status : 502)
            .view('dashboards/superset-sharing.ejs', {
              user: request.sessionUser,
              dashboard,
              sharing,
              tenantChoices: tenantChoices(
                tenants,
                sharing.audience.tenants ?? null,
                sharing.pinnedTenants,
              ),
              error: e.message,
              title: `Sharing — ${dashboard.title}`,
            })
        }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/dashboards/superset/:id/guest-token',
      // The SDK refreshes a token shortly before it expires (5 minutes); a
      // budget per client is still sensible for an endpoint that signs tokens.
      { config: { rateLimit: { max: 60, timeWindow: 60_000 } } },
      async (request, reply) => {
        reply.header('Cache-Control', 'no-store')
        try {
          const t = await apiClient.createSupersetGuestToken(
            request.sessionUser!.token,
            request.params.id,
          )
          return reply.send({ token: t.token, expiresAt: t.expiresAt })
        } catch (err) {
          const e = apiError(err)
          return reply.status(e.status).send({ error: { code: e.code, message: e.message } })
        }
      },
    )
  }
}
