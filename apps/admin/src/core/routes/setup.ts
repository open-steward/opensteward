import type { FastifyInstance } from 'fastify'
import type { AdminApiClient } from '../proxy/admin-api-client'

export function createSetupRoutes(apiClient: AdminApiClient) {
  return async function setupRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/setup/init', async (request, reply) => {
      try {
        const hasUsers = await apiClient.hasUsers()
        if (hasUsers) return reply.redirect('/login')
      } catch {
        // Admin API unreachable — show setup page anyway
      }
      return reply.view('setup/init.ejs', { error: null, csrfToken: (request as any).csrfToken })
    })

    fastify.post<{
      Body: {
        username: string
        password: string
        confirm_password: string
        bootstrap_token?: string
      }
    }>(
      '/setup/init',
      { config: { rateLimit: { max: 3, timeWindow: 60_000 } } },
      async (request, reply) => {
        const { username, password, confirm_password, bootstrap_token } =
          request.body ?? ({} as Record<string, string>)
        const viewErr = (error: string) =>
          reply.view('setup/init.ejs', { error, csrfToken: (request as any).csrfToken })

        if (!username || !password) return viewErr('All fields are required')
        if (username.length > 64) return viewErr('Username must be 64 characters or fewer')
        if (password !== confirm_password) return viewErr('Passwords do not match')

        try {
          await apiClient.setup(username, password, bootstrap_token?.trim() || undefined)
          return reply.redirect('/login')
        } catch (err: any) {
          const message = err?.response?.data?.error ?? 'Setup failed — is the Admin API running?'
          return viewErr(message)
        }
      },
    )
  }
}
