/**
 * Admin passthrough for `/admin/oauth/*` on integration-server.
 *
 * Issuers, registered clients and scope rules live in integration-server's
 * database, next to the verifier that reads them on every request. Admin-api
 * re-exposes them through its JWT-protected pipeline so the admin UI keeps one
 * auth model — the same arrangement as platform config and API keys.
 *
 * Reads are operator+, so an operator can answer "which service accounts can
 * reach us?" without being able to add one. Every mutation is admin-only and
 * audited.
 *
 * Nothing here handles a secret. A resource server verifies with the issuer's
 * published public keys, so there is no client secret to mask or merge — none
 * of the partial-update hazards that apply to SSO provider config apply here.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { UnifiedClient } from '../proxy/client'
import type { AdminStore } from '../db/admin-store'
import {
  OAuthIssuer,
  OAuthIssuerDetail,
  OAuthClient,
  OAuthScopeRule,
  OAuthReadiness,
  OAuthDiscovery,
  OAuthPreset,
  dataEnvelope,
  listEnvelope,
  errorBody,
  noContent,
} from './_openapi'
import { denyRestrictedScope } from '../auth/access'

const TAG = 'oauth-clients'

const IdParam = z.object({ id: z.string() })

const AuthorityMode = z.enum(['registry', 'intersect', 'external'])

const IssuerBody = z
  .object({
    name: z
      .string()
      .min(1)
      .meta({ description: 'Operator-facing label.', example: 'Corp Keycloak' }),
    preset: z
      .string()
      .optional()
      .meta({ description: 'Vendor preset the claim names came from.', example: 'keycloak' }),
    issuer: z
      .string()
      .min(1)
      .meta({
        description: 'The exact `iss` value tokens carry.',
        example: 'https://idp.corp.example/realms/main',
      }),
    jwksUri: z
      .string()
      .min(1)
      .meta({
        description: 'Signing-key endpoint, normally taken from the discovery document.',
        example: 'https://idp.corp.example/realms/main/protocol/openid-connect/certs',
      }),
    audience: z
      .string()
      .min(1)
      .meta({
        description:
          'The exact `aud` value tokens must carry. Required — a blank audience accepts every token the issuer ever minted.',
        example: 'https://opensteward.corp.internal',
      }),
    subjectClaim: z
      .string()
      .min(1)
      .meta({ description: 'Which claim names the calling client.', example: 'azp' }),
    scopeClaim: z
      .string()
      .min(1)
      .meta({ description: 'Which claim carries the scopes.', example: 'realm_access.roles' }),
    algorithms: z
      .array(z.string())
      .optional()
      .meta({ description: 'Accepted signature algorithms. Asymmetric only.', example: ['RS256'] }),
    authorityMode: AuthorityMode.optional().meta({
      description: 'Where tenant and scopes come from.',
      example: 'registry',
    }),
    tenantClaim: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: 'External mode only: which claim names the tenant.',
        example: 'https://opensteward/tenant',
      }),
    allowedTenants: z
      .array(z.string())
      .optional()
      .meta({
        description: 'External mode only: tenants this issuer may assert. Empty admits nobody.',
        example: ['acme'],
      }),
    maxTokenLifetimeS: z
      .number()
      .int()
      .positive()
      .optional()
      .meta({
        description: 'External mode only: reject tokens living longer than this.',
        example: 3600,
      }),
    enabled: z
      .boolean()
      .optional()
      .meta({ description: 'Whether tokens from it are accepted.', example: true }),
  })
  .meta({
    id: 'CreateOAuthIssuerBody',
    description: 'Register an identity provider whose tokens the developer API accepts.',
  })

const IssuerPatchBody = IssuerBody.partial().meta({
  id: 'UpdateOAuthIssuerBody',
  description:
    'Fields to change. The merged row is validated, not the patch — switching to external authority without naming a tenant claim is refused here rather than failing open at request time.',
})

const ClientBody = z
  .object({
    subject: z
      .string()
      .min(1)
      .meta({
        description: "Value of the issuer's subject claim identifying this client.",
        example: 'billing-service',
      }),
    tenantId: z
      .string()
      .min(1)
      .meta({ description: 'Tenant it authenticates as.', example: 'acme' }),
    label: z
      .string()
      .nullable()
      .optional()
      .meta({ description: 'Human-friendly label.', example: 'Billing service' }),
    scopes: z
      .array(z.string())
      .min(1)
      .meta({
        description: 'Scopes to grant — the same vocabulary API keys use.',
        example: ['customers:read'],
      }),
  })
  .meta({
    id: 'CreateOAuthClientBody',
    description: 'Register a service account against an issuer.',
  })

const RuleBody = z
  .object({
    claimValue: z
      .string()
      .min(1)
      .meta({
        description: "A value as it appears in the token's scope claim.",
        example: 'read:ledger',
      }),
    grantedScope: z
      .string()
      .min(1)
      .meta({ description: 'The OpenSteward scope it grants.', example: 'vertical:accounting' }),
    priority: z
      .number()
      .int()
      .optional()
      .meta({ description: 'Evaluation order, ascending.', example: 0 }),
  })
  .meta({
    id: 'CreateOAuthScopeRuleBody',
    description: "Map one of the IdP's scope values onto an OpenSteward scope.",
  })

const DiscoverBody = z
  .object({
    issuer: z
      .string()
      .min(1)
      .meta({
        description: 'Issuer URL to read the discovery document from.',
        example: 'https://idp.corp.example/realms/main',
      }),
  })
  .meta({
    id: 'DiscoverOAuthIssuerBody',
    description: "Read an issuer's OpenID discovery document without saving anything.",
  })

export function createOAuthClientsRoutes(client: UnifiedClient, adminStore: AdminStore) {
  return async function oauthClientsRoutes(fastify: FastifyInstance): Promise<void> {
    // Not tenant-scoped yet: a tenant-restricted caller is refused outright
    // (403 SCOPE_RESTRICTED) rather than shown every tenant's rows.
    fastify.addHook('preHandler', denyRestrictedScope)
    fastify.get(
      '/api/oauth/issuers',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'List registered identity providers',
          description:
            'Every identity provider whose OIDC bearer tokens this deployment will accept on `/v1/*`. Operator role or higher — reading which service accounts can reach the deployment does not require the ability to add one.',
          operationId: 'oauth-clients.listIssuers',
          response: { 200: listEnvelope(OAuthIssuer), 401: errorBody, 403: errorBody },
        },
      },
      async () => {
        const data = (await client.listOAuthIssuers()) as unknown[]
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.get(
      '/api/oauth/readiness',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Whether OIDC bearer auth could admit anybody',
          description:
            'Checked before allowing `auth.dev_api_keys_enabled` to be switched off, so that change cannot lock every developer out of a running deployment. Ready means an issuer is enabled, can admit somebody, and has already verified a real token.',
          operationId: 'oauth-clients.readiness',
          response: { 200: dataEnvelope(OAuthReadiness), 401: errorBody, 403: errorBody },
        },
      },
      async () => ({ data: await client.getOAuthReadiness() }),
    )

    fastify.get(
      '/api/oauth/presets',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Claim-name defaults for known identity providers',
          description:
            'Keycloak, Auth0, Okta and Entra ID name the subject and scope claims differently. These are the defaults the admin form seeds from; the verifier itself is identical for every issuer.',
          operationId: 'oauth-clients.listPresets',
          response: { 200: listEnvelope(OAuthPreset), 401: errorBody, 403: errorBody },
        },
      },
      async () => {
        const data = (await client.listOAuthPresets()) as unknown[]
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/api/oauth/issuers/:id',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Get one issuer with its clients and scope rules',
          operationId: 'oauth-clients.getIssuer',
          params: IdParam,
          response: {
            200: dataEnvelope(OAuthIssuerDetail),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request) => ({ data: await client.getOAuthIssuer(request.params.id) }),
    )

    fastify.post<{ Body: z.infer<typeof DiscoverBody> }>(
      '/api/oauth/discover',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Read an issuer discovery document',
          description:
            "Fetches `{issuer}/.well-known/openid-configuration` and reports the signing-key endpoint, without saving anything, so an operator can check a URL before committing to it. The document's own issuer must match what was typed — otherwise a misconfigured or hostile endpoint could point the deployment at somebody else's signing keys.",
          operationId: 'oauth-clients.discover',
          body: DiscoverBody,
          response: {
            200: dataEnvelope(OAuthDiscovery),
            400: errorBody,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => ({ data: await client.discoverOAuthIssuer(request.body.issuer) }),
    )

    fastify.post<{ Body: z.infer<typeof IssuerBody> }>(
      '/api/oauth/issuers',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Register an identity provider',
          description:
            'Admin only. Audience is required: without it every token the issuer ever minted for any application would be accepted here.',
          operationId: 'oauth-clients.createIssuer',
          body: IssuerBody,
          response: {
            201: dataEnvelope(OAuthIssuer),
            400: errorBody,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request, reply) => {
        const created = (await client.createOAuthIssuer(request.body)) as {
          id: string
          name: string
          issuer: string
          authorityMode: string
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'oauth_issuer.create',
          targetId: created.id,
          detail: {
            name: created.name,
            issuer: created.issuer,
            authorityMode: created.authorityMode,
          },
        })
        return reply.status(201).send({ data: created })
      },
    )

    fastify.patch<{ Params: { id: string }; Body: z.infer<typeof IssuerPatchBody> }>(
      '/api/oauth/issuers/:id',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Update an identity provider',
          operationId: 'oauth-clients.updateIssuer',
          params: IdParam,
          body: IssuerPatchBody,
          response: {
            200: dataEnvelope(OAuthIssuer),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request) => {
        const updated = (await client.updateOAuthIssuer(request.params.id, request.body)) as {
          name: string
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'oauth_issuer.update',
          targetId: request.params.id,
          // Field names only. The values are configuration, not secrets, but an
          // audit row should not become a second copy of the thing it protects.
          detail: { name: updated.name, changed: Object.keys(request.body) },
        })
        return { data: updated }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/oauth/issuers/:id',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Delete an identity provider',
          description:
            'Removes the issuer along with its registered clients and scope rules. Tokens from it stop being accepted immediately.',
          operationId: 'oauth-clients.deleteIssuer',
          params: IdParam,
          response: { 204: noContent, 401: errorBody, 403: errorBody, 404: errorBody },
        },
      },
      async (request, reply) => {
        const detail = (await client.getOAuthIssuer(request.params.id)) as
          | {
              issuer?: { name?: string; issuer?: string }
            }
          | undefined
        await client.deleteOAuthIssuer(request.params.id)
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'oauth_issuer.delete',
          targetId: request.params.id,
          detail: {
            name: detail?.issuer?.name ?? request.params.id,
            issuer: detail?.issuer?.issuer ?? '',
          },
        })
        return reply.status(204).send()
      },
    )

    fastify.post<{ Params: { id: string }; Body: z.infer<typeof ClientBody> }>(
      '/api/oauth/issuers/:id/clients',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Register a service account',
          description:
            'Binds a subject from this issuer to a tenant and a scope set. Deleting the row later cuts off a still-valid token immediately, which is what registry authority buys over reading scopes from the token.',
          operationId: 'oauth-clients.createClient',
          params: IdParam,
          body: ClientBody,
          response: {
            201: dataEnvelope(OAuthClient),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const created = (await client.createOAuthClient(request.params.id, request.body)) as {
          id: string
          subject: string
          tenantId: string
          scopes: string[]
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'oauth_client.create',
          targetId: created.id,
          detail: {
            subject: created.subject,
            tenantId: created.tenantId,
            scopes: created.scopes,
          },
        })
        return reply.status(201).send({ data: created })
      },
    )

    fastify.delete<{ Params: { id: string }; Querystring: { subject?: string } }>(
      '/api/oauth/clients/:id',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Revoke a service account',
          description:
            'Takes effect on the next request, mid-token: the client row is consulted on every call, so a revoked account stops working before its token expires.',
          operationId: 'oauth-clients.revokeClient',
          params: IdParam,
          response: { 204: noContent, 401: errorBody, 403: errorBody, 404: errorBody },
        },
      },
      async (request, reply) => {
        await client.revokeOAuthClient(request.params.id)
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'oauth_client.revoke',
          targetId: request.params.id,
          detail: { subject: request.query.subject ?? request.params.id },
        })
        return reply.status(204).send()
      },
    )

    fastify.post<{ Params: { id: string }; Body: z.infer<typeof RuleBody> }>(
      '/api/oauth/issuers/:id/rules',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Add a scope-mapping rule',
          description:
            "With no rules the token's scope claim passes through verbatim. Once any rule exists, only mapped values survive — an unmapped one is dropped rather than passed through raw.",
          operationId: 'oauth-clients.createScopeRule',
          params: IdParam,
          body: RuleBody,
          response: {
            201: dataEnvelope(OAuthScopeRule),
            400: errorBody,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request, reply) => {
        const created = await client.createOAuthScopeRule(request.params.id, request.body)
        return reply.status(201).send({ data: created })
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/oauth/rules/:id',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Delete a scope-mapping rule',
          operationId: 'oauth-clients.deleteScopeRule',
          params: IdParam,
          response: { 204: noContent, 401: errorBody, 403: errorBody, 404: errorBody },
        },
      },
      async (request, reply) => {
        await client.deleteOAuthScopeRule(request.params.id)
        return reply.status(204).send()
      },
    )
  }
}
