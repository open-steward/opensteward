/**
 * UI-side SSO glue.
 *
 *   GET  /login/sso/:slug          — redirect the browser to the admin-api SSO
 *                                    initiation endpoint (OIDC/SAML).
 *   POST /login/sso/:slug/ldap     — LDAP form submit: server-to-server auth via
 *                                    admin-api, then set the session cookie.
 *   GET  /login/sso/complete?code= — exchange the one-time handoff code for the
 *                                    JWT (server-to-server) and set the cookie.
 *
 * The cookie shape MUST match routes/login.ts so the rest of the UI keeps
 * reading request.sessionUser unchanged.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { AdminApiClient } from '../proxy/admin-api-client'
import { SESSION_COOKIE_ATTRIBUTES, SESSION_COOKIE_MAX_AGE } from '../auth/session-cookie'
import type { Config } from '../../config'
import { sanitizeReturnTo } from './return-to'

function setSessionCookie(
  reply: FastifyReply,
  user: { id: string; username: string; role: string },
  token: string,
): void {
  reply.setCookie(
    'session',
    JSON.stringify({ id: user.id, username: user.username, role: user.role, token }),
    { ...SESSION_COOKIE_ATTRIBUTES, signed: true, maxAge: SESSION_COOKIE_MAX_AGE },
  )
}

export function createSsoRoutes(apiClient: AdminApiClient, config: Config) {
  return async function ssoRoutes(fastify: FastifyInstance): Promise<void> {
    const apiBase = config.sso.publicBaseUrl

    // Redirect into the admin-api initiation endpoint (OIDC/SAML).
    fastify.get<{ Params: { slug: string }; Querystring: { return_to?: string } }>(
      '/login/sso/:slug',
      async (request, reply) => {
        const returnTo = sanitizeReturnTo(request.query.return_to)
        const params = new URLSearchParams({ return_to: returnTo })
        const slug = encodeURIComponent(request.params.slug)
        return reply.redirect(`${apiBase}/api/sso/${slug}/login?${params.toString()}`)
      },
    )

    // LDAP login form submit.
    fastify.post<{
      Params: { slug: string }
      Body: { username?: string; password?: string; return_to?: string }
    }>(
      '/login/sso/:slug/ldap',
      { config: { rateLimit: { max: 5, timeWindow: 60_000 } } },
      async (request, reply) => {
        const { username, password } = request.body ?? {}
        const returnTo = sanitizeReturnTo(request.body?.return_to)
        if (!username || !password) {
          return reply.view(
            'login.ejs',
            await loginViewData(apiClient, 'Username and password are required', request),
          )
        }
        try {
          const result = await apiClient.ldapLogin(request.params.slug, username, password)
          setSessionCookie(reply, result.user, result.token)
          return reply.redirect(returnTo)
        } catch {
          return reply.view(
            'login.ejs',
            await loginViewData(apiClient, 'Invalid credentials', request),
          )
        }
      },
    )

    // Handoff completion (OIDC/SAML return trip).
    fastify.get<{ Querystring: { code?: string; return_to?: string } }>(
      '/login/sso/complete',
      async (request, reply) => {
        const code = request.query.code
        const returnTo = sanitizeReturnTo(request.query.return_to)
        if (!code) {
          return reply.view(
            'login.ejs',
            await loginViewData(apiClient, 'Missing SSO handoff code', request),
          )
        }
        try {
          const result = await apiClient.exchangeSsoHandoff(code)
          setSessionCookie(reply, result.user, result.token)
          return reply.redirect(returnTo)
        } catch {
          return reply.view(
            'login.ejs',
            await loginViewData(apiClient, 'SSO sign-in failed or expired', request),
          )
        }
      },
    )
  }
}

/** Build the data the login view needs, re-fetching provider options. */
export async function loginViewData(
  apiClient: AdminApiClient,
  error: string | null,
  request: unknown,
): Promise<Record<string, unknown>> {
  let providers: Array<{ slug: string; name: string; protocol: string }> = []
  let localLoginEnabled = true
  try {
    const opts = await apiClient.getLoginOptions()
    providers = opts.providers
    localLoginEnabled = opts.localLoginEnabled
  } catch {
    // admin-api unreachable — fall back to local form only
  }
  return {
    error,
    providers,
    localLoginEnabled,
    csrfToken: (request as { csrfToken?: string }).csrfToken,
  }
}
