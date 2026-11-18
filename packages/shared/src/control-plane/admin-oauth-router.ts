/**
 * Operator CRUD for the OIDC bearer-token configuration.
 *
 * The issuer, client and scope-rule rows live in the integration-server's
 * database, because that is the process that verifies tokens on the request
 * hot path. So they are managed here and proxied by admin-api for the admin UI,
 * exactly as platform enable/disable and API-key minting already are, rather
 * than giving admin-api a second connection to a database it does not own.
 *
 * Guarded by `X-Admin-Secret`. `adminGuard` is called INSIDE each handler and
 * never registered as a hook — it returns a boolean rather than a promise, and
 * Fastify's hook runner only continues on a thenable, so as a hook it hangs the
 * request instead of refusing it.
 *
 * Nothing here handles a secret. A resource server verifies with the issuer's
 * published public keys, so there is no client secret to mask, merge or leak.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import {
  InvalidIssuerError,
  type AuthorityMode,
  type OAuthClientStore,
} from '../auth/oauth-clients'
import { IncompatibleMcpScopesError } from '../auth/api-keys'
import { DiscoveryError, discoverIssuer, ISSUER_PRESETS } from '../auth/oidc-verifier'
import { adminGuard } from './admin-guard'

export interface AdminOAuthRouterOptions {
  oauth: OAuthClientStore
}

interface IssuerBody {
  name?: string
  preset?: string
  issuer?: string
  jwksUri?: string
  audience?: string
  subjectClaim?: string
  scopeClaim?: string
  algorithms?: string[]
  authorityMode?: AuthorityMode
  tenantClaim?: string | null
  allowedTenants?: string[]
  maxTokenLifetimeS?: number
  enabled?: boolean
}

/** Map a store-level refusal onto the shape every other router answers with. */
function badRequest(err: unknown): { code: string; message: string; field?: string } | null {
  if (err instanceof InvalidIssuerError) {
    return { code: 'INVALID_ISSUER', message: err.message, field: err.field }
  }
  if (err instanceof IncompatibleMcpScopesError) {
    return { code: 'INCOMPATIBLE_MCP_SCOPES', message: err.message }
  }
  if (err instanceof DiscoveryError) {
    return { code: 'DISCOVERY_FAILED', message: err.message }
  }
  return null
}

export function createAdminOAuthRouter(opts: AdminOAuthRouterOptions): FastifyPluginAsync {
  const { oauth } = opts

  return async function adminOAuthRouter(fastify: FastifyInstance): Promise<void> {
    fastify.get('/admin/oauth/readiness', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const { ready, reason } = await oauth.readiness()
      return { data: { ready, reason } }
    })

    /** The vendor presets, so the admin form does not hard-code claim names. */
    fastify.get('/admin/oauth/presets', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      return { data: ISSUER_PRESETS }
    })

    /**
     * The Test button. Fetches the discovery document and reports what it
     * found, without saving anything — an operator can check a URL before
     * committing to it.
     */
    fastify.post<{ Body: { issuer?: string } }>('/admin/oauth/discover', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const issuer = request.body?.issuer?.trim()
      if (!issuer) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION', message: 'issuer is required.' } })
      }
      try {
        return { data: await discoverIssuer(issuer) }
      } catch (err) {
        const mapped = badRequest(err)
        if (mapped) return reply.status(400).send({ error: mapped })
        throw err
      }
    })

    fastify.get('/admin/oauth/issuers', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      return { data: await oauth.listIssuers() }
    })

    fastify.get<{ Params: { id: string } }>('/admin/oauth/issuers/:id', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const issuer = await oauth.getIssuer(request.params.id)
      if (!issuer) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No such issuer.' } })
      }
      return {
        data: {
          issuer,
          clients: await oauth.listClients(issuer.id),
          rules: await oauth.listRules(issuer.id),
        },
      }
    })

    fastify.post<{ Body: IssuerBody }>('/admin/oauth/issuers', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const b = request.body ?? {}
      try {
        const created = await oauth.createIssuer({
          name: b.name ?? '',
          preset: b.preset,
          issuer: b.issuer ?? '',
          jwksUri: b.jwksUri ?? '',
          audience: b.audience ?? '',
          subjectClaim: b.subjectClaim ?? 'sub',
          scopeClaim: b.scopeClaim ?? 'scope',
          algorithms: b.algorithms,
          authorityMode: b.authorityMode,
          tenantClaim: b.tenantClaim,
          allowedTenants: b.allowedTenants,
          maxTokenLifetimeS: b.maxTokenLifetimeS,
          enabled: b.enabled,
        })
        return reply.status(201).send({ data: created })
      } catch (err) {
        const mapped = badRequest(err)
        if (mapped) return reply.status(400).send({ error: mapped })
        throw err
      }
    })

    fastify.patch<{ Params: { id: string }; Body: IssuerBody }>(
      '/admin/oauth/issuers/:id',
      async (request, reply) => {
        if (!adminGuard(request, reply)) return reply
        try {
          const updated = await oauth.updateIssuer(request.params.id, request.body ?? {})
          if (!updated) {
            return reply
              .status(404)
              .send({ error: { code: 'NOT_FOUND', message: 'No such issuer.' } })
          }
          return { data: updated }
        } catch (err) {
          const mapped = badRequest(err)
          if (mapped) return reply.status(400).send({ error: mapped })
          throw err
        }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/admin/oauth/issuers/:id',
      async (request, reply) => {
        if (!adminGuard(request, reply)) return reply
        const removed = await oauth.deleteIssuer(request.params.id)
        if (!removed) {
          return reply
            .status(404)
            .send({ error: { code: 'NOT_FOUND', message: 'No such issuer.' } })
        }
        return { data: { deleted: true } }
      },
    )

    fastify.post<{
      Params: { id: string }
      Body: { subject?: string; tenantId?: string; label?: string | null; scopes?: string[] }
    }>('/admin/oauth/issuers/:id/clients', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const issuer = await oauth.getIssuer(request.params.id)
      if (!issuer) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No such issuer.' } })
      }
      const b = request.body ?? {}
      if (!b.subject?.trim() || !b.tenantId?.trim()) {
        return reply.status(400).send({
          error: { code: 'VALIDATION', message: 'subject and tenantId are required.' },
        })
      }
      if (!b.scopes || b.scopes.length === 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION',
            message: 'At least one scope is required — a client with none could reach nothing.',
          },
        })
      }
      try {
        const created = await oauth.createClient({
          issuerId: issuer.id,
          subject: b.subject.trim(),
          tenantId: b.tenantId.trim(),
          label: b.label ?? null,
          scopes: b.scopes,
        })
        return reply.status(201).send({ data: created })
      } catch (err) {
        const mapped = badRequest(err)
        if (mapped) return reply.status(400).send({ error: mapped })
        throw err
      }
    })

    fastify.delete<{ Params: { id: string } }>(
      '/admin/oauth/clients/:id',
      async (request, reply) => {
        if (!adminGuard(request, reply)) return reply
        const revoked = await oauth.revokeClient(request.params.id)
        if (!revoked) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: 'No such client, or already revoked.' },
          })
        }
        return { data: { revoked: true } }
      },
    )

    fastify.post<{
      Params: { id: string }
      Body: { claimValue?: string; grantedScope?: string; priority?: number }
    }>('/admin/oauth/issuers/:id/rules', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const b = request.body ?? {}
      if (!b.claimValue?.trim() || !b.grantedScope?.trim()) {
        return reply.status(400).send({
          error: { code: 'VALIDATION', message: 'claimValue and grantedScope are required.' },
        })
      }
      const created = await oauth.createRule({
        issuerId: request.params.id,
        claimValue: b.claimValue.trim(),
        grantedScope: b.grantedScope.trim(),
        priority: b.priority,
      })
      return reply.status(201).send({ data: created })
    })

    fastify.delete<{ Params: { id: string } }>('/admin/oauth/rules/:id', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const removed = await oauth.deleteRule(request.params.id)
      if (!removed) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No such rule.' } })
      }
      return { data: { deleted: true } }
    })
  }
}
