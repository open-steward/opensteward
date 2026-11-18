import type { FastifyInstance } from 'fastify'
import type { AdminApiClient } from '../proxy/admin-api-client'
import { SESSION_COOKIE_ATTRIBUTES, SESSION_COOKIE_MAX_AGE } from '../auth/session-cookie'
import { loginViewData } from './sso'

export function createLoginRoutes(apiClient: AdminApiClient, sessionSecret: string) {
  return async function loginRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/login', async (request, reply) => {
      if (request.sessionUser) return reply.redirect('/')
      return reply.view('login.ejs', await loginViewData(apiClient, null, request))
    })

    fastify.post<{ Body: { username: string; password: string } }>(
      '/login',
      {
        config: { rateLimit: { max: 5, timeWindow: 60_000 } },
      },
      async (request, reply) => {
        const { username, password } = request.body ?? ({} as Record<string, string>)
        if (username && username.length > 64)
          return reply.view(
            'login.ejs',
            await loginViewData(apiClient, 'Invalid credentials', request),
          )
        if (password && password.length > 128)
          return reply.view(
            'login.ejs',
            await loginViewData(apiClient, 'Invalid credentials', request),
          )
        if (!username || !password) {
          return reply.view(
            'login.ejs',
            await loginViewData(apiClient, 'Username and password are required', request),
          )
        }

        try {
          const result = await apiClient.login(username, password)

          reply.setCookie(
            'session',
            JSON.stringify({
              id: result.user.id,
              username: result.user.username,
              role: result.user.role,
              token: result.token,
            }),
            { ...SESSION_COOKIE_ATTRIBUTES, signed: true, maxAge: SESSION_COOKIE_MAX_AGE },
          )

          return reply.redirect('/')
        } catch (err: unknown) {
          const e = err as { response?: { status?: number; data?: { error?: string } } }
          const message =
            e?.response?.status === 403
              ? (e.response.data?.error ?? 'Local login is disabled. Please use SSO.')
              : 'Invalid username or password'
          return reply.view('login.ejs', await loginViewData(apiClient, message, request))
        }
      },
    )

    fastify.post('/logout', async (request, reply) => {
      reply.clearCookie('session', SESSION_COOKIE_ATTRIBUTES)
      return reply.redirect('/login')
    })
  }
}
