/**
 * Admin UI for SSO identity providers — list, create, edit, delete, manage
 * role-mapping rules and SCIM tokens. Admin-only. Proxies to the admin-api.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireRole } from '../auth/middleware'
import type { AdminApiClient } from '../proxy/admin-api-client'
import type { Config } from '../../config'
import { applyTableQuery, parseTableQuery, type TableSpec } from '../views/table-controls'

type Protocol = 'saml' | 'oidc' | 'ldap'

/**
 * Which columns of the identity-providers table sort and filter, and on what.
 *
 * JIT reads `p.jitEnabled` — NOT `p.jitProvisioning`, which does not exist on
 * this row and would silently sort/filter nothing.
 */
const IDP_TABLE: TableSpec = {
  id: 'idp-filters',
  baseUrl: '/identity-providers',
  columns: [
    { key: 'name', header: 'Name', sortable: true, filter: 'text', get: (p: any) => p.name },
    { key: 'protocol', header: 'Protocol', sortable: true, filter: 'text', get: (p: any) => p.protocol },
    { key: 'slug', header: 'Slug', sortable: true, filter: 'text', get: (p: any) => p.slug },
    { key: 'status', header: 'Status', sortable: true, get: (p: any) => (p.enabled ? 'enabled' : 'disabled') },
    { key: 'jit', header: 'JIT', sortable: true, get: (p: any) => (p.jitEnabled ? 'on' : 'off') },
    { key: 'role', header: 'Default role', sortable: true, filter: 'text', get: (p: any) => p.defaultRole },
  ],
}

/** Translate the flat config form fields into the per-protocol config object. */
function buildConfig(protocol: Protocol, body: Record<string, string>): Record<string, unknown> {
  if (protocol === 'oidc') {
    return {
      issuer: body.issuer?.trim(),
      clientId: body.clientId?.trim(),
      scopes: body.scopes?.trim() || 'openid profile email',
      groupsClaim: body.groupsClaim?.trim() || 'groups',
    }
  }
  if (protocol === 'saml') {
    return {
      entryPoint: body.entryPoint?.trim(),
      idpIssuer: body.idpIssuer?.trim(),
      spEntityId: body.spEntityId?.trim(),
      groupsAttribute: body.groupsAttribute?.trim() || 'groups',
      emailAttribute: body.emailAttribute?.trim() || 'email',
      // Optional: blank means "try the common names" (admin-api's default).
      ...(body.pictureAttribute?.trim() ? { pictureAttribute: body.pictureAttribute.trim() } : {}),
    }
  }
  return {
    url: body.url?.trim(),
    bindDn: body.bindDn?.trim(),
    searchBase: body.searchBase?.trim(),
    searchFilter: body.searchFilter?.trim() || '(uid={{username}})',
    groupsAttribute: body.groupsAttribute?.trim() || 'memberOf',
    emailAttribute: body.emailAttribute?.trim() || 'mail',
    displayNameAttribute: body.displayNameAttribute?.trim() || 'cn',
  }
}

function buildSecret(
  protocol: Protocol,
  body: Record<string, string>,
): Record<string, string> | undefined {
  const secret: Record<string, string> = {}
  if (protocol === 'oidc' && body.clientSecret) secret.clientSecret = body.clientSecret
  if (protocol === 'ldap' && body.ldapBindPassword) secret.ldapBindPassword = body.ldapBindPassword
  if (protocol === 'saml' && body.idpCert) secret.idpCert = body.idpCert
  return Object.keys(secret).length > 0 ? secret : undefined
}

export function createIdentityProvidersRoutes(apiClient: AdminApiClient, config: Config) {
  return async function identityProvidersRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireRole('admin'))
    const csrf = (request: unknown) => (request as { csrfToken?: string }).csrfToken

    fastify.get('/identity-providers', async (request, reply) => {
      const token = request.sessionUser!.token
      const providers = await apiClient.listIdentityProviders(token)
      const tableState = parseTableQuery(request.query, IDP_TABLE)
      return reply.view('identity-providers/index.ejs', {
        user: request.sessionUser,
        providers: applyTableQuery(providers, tableState, IDP_TABLE),
        tableSpec: IDP_TABLE,
        tableState,
        ssoBaseUrl: config.sso.publicBaseUrl,
        docsServerUrl: config.docs_server.url,
      })
    })

    fastify.get('/identity-providers/new', async (request, reply) => {
      return reply.view('identity-providers/new.ejs', {
        user: request.sessionUser,
        error: null,
        csrfToken: csrf(request),
      })
    })

    fastify.post<{ Body: Record<string, string> }>(
      '/identity-providers',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const body = request.body ?? {}
        const protocol = body.protocol as Protocol
        try {
          await apiClient.createIdentityProvider(token, {
            name: body.name,
            slug: body.slug,
            protocol,
            enabled: body.enabled === 'on',
            jitEnabled: body.jitEnabled !== 'off',
            defaultRole: body.defaultRole || 'viewer',
            config: buildConfig(protocol, body),
            secret: buildSecret(protocol, body),
          })
          return reply.redirect('/identity-providers')
        } catch (err: unknown) {
          const error = errMessage(err, 'Failed to create provider')
          return reply.view('identity-providers/new.ejs', {
            user: request.sessionUser,
            error,
            csrfToken: csrf(request),
          })
        }
      },
    )

    /**
     * Render the provider edit page.
     *
     * Shared by the GET and by the SCIM-token mint POST, which renders it
     * directly rather than redirecting: the minted value is a live credential,
     * and a redirect put it in `req.url` — which is not redacted from the
     * request log, so it reached stdout, browser history and the address bar.
     */
    async function renderProviderEdit(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
      opts: { mintedToken?: string | null } = {},
    ) {
      const token = request.sessionUser!.token
      const provider = await apiClient.getIdentityProvider(token, request.params.id)
      if (!provider) return reply.redirect('/identity-providers')
      const [roleMappings, scimTokens, scopeRules, roles, tenants] = await Promise.all([
        apiClient.listRoleMappings(token, request.params.id),
        apiClient.listScimTokens(token, request.params.id),
        // Best-effort: the scope section and the custom-role picker are
        // additions to a page that must keep working against an admin-api
        // that cannot answer them (older, or the caller lacks users:manage).
        // The template says so rather than rendering an empty list as fact.
        apiClient.listScopeRules(token, request.params.id).catch(() => null),
        apiClient.listRoles(token).catch(() => null),
        apiClient.listTenants(token).catch(() => []),
      ])
      const scimBase = `${config.sso.publicBaseUrl}/scim/v2`
      return reply.view('identity-providers/edit.ejs', {
        user: request.sessionUser,
        provider,
        roleMappings,
        scimTokens,
        scopeRules,
        roles,
        tenants,
        scimBase,
        mintedToken: opts.mintedToken ?? null,
        error: null,
        csrfToken: csrf(request),
      })
    }

    fastify.get<{ Params: { id: string } }>('/identity-providers/:id', async (request, reply) =>
      renderProviderEdit(request, reply),
    )

    fastify.post<{ Params: { id: string }; Body: Record<string, string> }>(
      '/identity-providers/:id',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const provider = await apiClient.getIdentityProvider(token, request.params.id)
        if (!provider) return reply.redirect('/identity-providers')
        const body = request.body ?? {}
        const protocol = provider.protocol as Protocol
        // Deliberately uncaught. The catch this replaces redirected to the same
        // page the success branch redirects to, so a rejected edit was
        // pixel-identical to a saved one: the operator read the *stored*
        // provider back, saw the page they expected, and believed SSO was
        // configured. edit.ejs has no error slot to render into, so the honest
        // option is to let server.ts's handler show the upstream status and
        // reason — "issuer is required" beats a silent bounce.
        await apiClient.updateIdentityProvider(token, request.params.id, {
          name: body.name,
          slug: body.slug,
          enabled: body.enabled === 'on',
          jitEnabled: body.jitEnabled !== 'off',
          defaultRole: body.defaultRole || 'viewer',
          config: buildConfig(protocol, body),
          secret: buildSecret(protocol, body),
        })
        return reply.redirect(`/identity-providers/${request.params.id}`)
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/identity-providers/:id/delete',
      async (request, reply) => {
        await apiClient.deleteIdentityProvider(request.sessionUser!.token, request.params.id)
        return reply.redirect('/identity-providers')
      },
    )

    // Role mappings
    fastify.post<{ Params: { id: string }; Body: Record<string, string> }>(
      '/identity-providers/:id/role-mappings',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const body = request.body ?? {}
        // Deliberately uncaught, same reason as the update above: the redirect
        // is exactly what a created rule looks like. A rule that maps an IdP
        // group to `admin` and never landed is a permissions gap the operator
        // believes they closed.
        // The picker posts `roleId` (built-in or custom); `role` is the
        // pre-custom-role field, still accepted.
        await apiClient.createRoleMapping(token, request.params.id, {
          priority: body.priority ? Number(body.priority) : undefined,
          claimPath: body.claimPath,
          matchType: body.matchType,
          matchValue: body.matchValue,
          ...(body.roleId ? { roleId: body.roleId } : { role: body.role }),
        })
        return reply.redirect(`/identity-providers/${request.params.id}`)
      },
    )

    // Scope rules + default scope. Uncaught for the same reason as the role
    // mappings above: a scope rule that silently failed to land is a tenant
    // boundary the operator believes is in place.
    fastify.post<{ Params: { id: string }; Body: Record<string, string | string[]> }>(
      '/identity-providers/:id/scope-rules',
      async (request, reply) => {
        const body = request.body ?? {}
        const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[v.length - 1] : v) ?? ''
        const list = (v: string | string[] | undefined) =>
          (Array.isArray(v) ? v : [v ?? ''])
            .flatMap((x) => String(x).split(','))
            .map((x) => x.trim())
            .filter(Boolean)
        const verticals = list(body.verticals)
        await apiClient.createScopeRule(request.sessionUser!.token, request.params.id, {
          priority: one(body.priority) ? Number(one(body.priority)) : undefined,
          claimPath: one(body.claimPath),
          matchType: one(body.matchType),
          matchValue: one(body.matchValue),
          tenantIds: list(body.tenantIds),
          verticals: verticals.length > 0 ? verticals : '*',
        })
        return reply.redirect(`/identity-providers/${request.params.id}`)
      },
    )

    fastify.post<{ Params: { id: string; ruleId: string } }>(
      '/identity-providers/:id/scope-rules/:ruleId/delete',
      async (request, reply) => {
        await apiClient.deleteScopeRule(
          request.sessionUser!.token,
          request.params.id,
          Number(request.params.ruleId),
        )
        return reply.redirect(`/identity-providers/${request.params.id}`)
      },
    )

    fastify.post<{ Params: { id: string }; Body: Record<string, string | string[]> }>(
      '/identity-providers/:id/default-scope',
      async (request, reply) => {
        const body = request.body ?? {}
        const raw = body.tenantIds
        const tenantIds = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).filter(Boolean)
        await apiClient.updateProviderDefaultScope(request.sessionUser!.token, request.params.id, {
          mode: body.mode === 'restricted' ? 'restricted' : 'all',
          tenantIds,
        })
        return reply.redirect(`/identity-providers/${request.params.id}`)
      },
    )

    fastify.post<{ Params: { id: string; ruleId: string } }>(
      '/identity-providers/:id/role-mappings/:ruleId/delete',
      async (request, reply) => {
        await apiClient.deleteRoleMapping(
          request.sessionUser!.token,
          request.params.id,
          Number(request.params.ruleId),
        )
        return reply.redirect(`/identity-providers/${request.params.id}`)
      },
    )

    // SCIM tokens
    fastify.post<{ Params: { id: string }; Body: Record<string, string> }>(
      '/identity-providers/:id/scim-tokens',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const minted = await apiClient.mintScimToken(token, request.params.id, request.body?.label)
        return renderProviderEdit(request, reply, { mintedToken: minted.plaintext })
      },
    )

    fastify.post<{ Params: { id: string; tokenId: string } }>(
      '/identity-providers/:id/scim-tokens/:tokenId/delete',
      async (request, reply) => {
        await apiClient.revokeScimToken(
          request.sessionUser!.token,
          request.params.id,
          request.params.tokenId,
        )
        return reply.redirect(`/identity-providers/${request.params.id}`)
      },
    )
  }
}

function errMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error ?? fallback
}
