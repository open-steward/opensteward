/**
 * Identity-provider management — admin-only CRUD for SSO providers, their
 * role-mapping rules, and SCIM tokens. Secrets are write-only (never returned).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AdminStore } from '../db/admin-store'
import type { IdentityStore, IdpProtocol as IdpProtocolType } from '../db/identity-store'
import { UnreadableSecretUpdateRefusedError } from '../db/identity-store'
import type { Config } from '../../config'
import { validateConfig, isRole, type ResolvedIdentity } from '../auth/idp/types'
import { BUILTIN_ROLE_PERMISSIONS } from '@opensteward/shared'
import {
  callerContext,
  callerMayGrantScope,
  requirePermission,
  roleGrantRefusal,
} from '../auth/access'
import { samlMetadata } from '../auth/idp/saml-provider'
import {
  IdentityProvider,
  IdpConfigByProtocol,
  IdpProtocol,
  IdpSecretBundle,
  LdapConfig,
  OidcConfig,
  RoleEnum,
  RoleMappingRule,
  RoleMatchType,
  SamlConfig,
  ScopeMappingRule,
  ScopeMode,
  ScimToken,
  ScimTokenMint,
  dataEnvelope,
  listEnvelope,
  errorBody,
  noContent,
} from './_openapi'

const TAG = 'identity-providers'

const SecretSchema = IdpSecretBundle.optional()

const SlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits, and hyphens')
  .meta({ description: 'URL-safe identifier used in SSO routes; lowercase letters, digits, and hyphens only.', example: 'northwind' })

/**
 * Create body — scaffold fields PLUS protocol-keyed `config`.
 *
 * The body is a discriminated union on `protocol` so OIDC requires the
 * OIDC config shape, SAML requires the SAML config shape, and LDAP
 * requires the LDAP config shape. `config` is optional on each branch —
 * an empty new provider fills it in later.
 */
const CreateOidcBody = z.object({
  name: z.string().min(1).max(120).meta({ description: 'Human-friendly display name for the IdP.', example: 'Northwind SSO' }),
  slug: SlugSchema,
  protocol: z.literal('oidc').meta({ description: 'Discriminator: creates an OpenID Connect provider.', example: 'oidc' }),
  enabled: z.boolean().optional().meta({ description: 'Whether the IdP is active immediately; defaults to enabled.', example: true }),
  config: OidcConfig.optional().meta({ description: 'OIDC non-secret config; may be omitted now and filled in later.' }),
  secret: SecretSchema,
  jitEnabled: z.boolean().optional().meta({ description: 'When true, users are just-in-time provisioned on first SSO login.', example: true }),
  defaultRole: RoleEnum.optional().meta({ description: 'Role for JIT-provisioned users when no mapping rule matches.', example: 'viewer' }),
}).meta({ id: 'CreateOidcIdentityProviderBody', description: 'Request body to create an OIDC identity provider.' })

const CreateSamlBody = z.object({
  name: z.string().min(1).max(120).meta({ description: 'Human-friendly display name for the IdP.', example: 'Northwind SSO' }),
  slug: SlugSchema,
  protocol: z.literal('saml').meta({ description: 'Discriminator: creates a SAML provider.', example: 'saml' }),
  enabled: z.boolean().optional().meta({ description: 'Whether the IdP is active immediately; defaults to enabled.', example: true }),
  config: SamlConfig.optional().meta({ description: 'SAML non-secret config; may be omitted now and filled in later.' }),
  secret: SecretSchema,
  jitEnabled: z.boolean().optional().meta({ description: 'When true, users are just-in-time provisioned on first SSO login.', example: true }),
  defaultRole: RoleEnum.optional().meta({ description: 'Role for JIT-provisioned users when no mapping rule matches.', example: 'viewer' }),
}).meta({ id: 'CreateSamlIdentityProviderBody', description: 'Request body to create a SAML identity provider.' })

const CreateLdapBody = z.object({
  name: z.string().min(1).max(120).meta({ description: 'Human-friendly display name for the IdP.', example: 'Northwind SSO' }),
  slug: SlugSchema,
  protocol: z.literal('ldap').meta({ description: 'Discriminator: creates an LDAP provider.', example: 'ldap' }),
  enabled: z.boolean().optional().meta({ description: 'Whether the IdP is active immediately; defaults to enabled.', example: true }),
  config: LdapConfig.optional().meta({ description: 'LDAP non-secret config; may be omitted now and filled in later.' }),
  secret: SecretSchema,
  jitEnabled: z.boolean().optional().meta({ description: 'When true, users are just-in-time provisioned on first successful login.', example: true }),
  defaultRole: RoleEnum.optional().meta({ description: 'Role for JIT-provisioned users when no mapping rule matches.', example: 'viewer' }),
}).meta({ id: 'CreateLdapIdentityProviderBody', description: 'Request body to create an LDAP identity provider.' })

const CreateSchema = z
  .discriminatedUnion('protocol', [CreateOidcBody, CreateSamlBody, CreateLdapBody])
  .meta({
    id: 'CreateIdentityProviderBody',
    description: 'Create an identity provider. Body is keyed by `protocol` — OIDC, SAML, and LDAP each pin the per-protocol config shape.',
    override: ({ jsonSchema }) => {
      jsonSchema.discriminator = {
        propertyName: 'protocol',
        mapping: {
          oidc: '#/components/schemas/CreateOidcIdentityProviderBody',
          saml: '#/components/schemas/CreateSamlIdentityProviderBody',
          ldap: '#/components/schemas/CreateLdapIdentityProviderBody',
        },
      }
    },
  })

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional().meta({ description: 'New display name for the IdP.', example: 'Northwind SSO' }),
  slug: SlugSchema.optional(),
  enabled: z.boolean().optional().meta({ description: 'Enable or disable the IdP.', example: true }),
  // Update body keeps `config` as a plain union of the per-protocol shapes
  // (rather than a discriminated union) because the existing provider's
  // protocol is the discriminator — the request body itself doesn't carry
  // one for PUT (the protocol is immutable post-create). Each branch is
  // still named so consumers see the per-protocol shape.
  config: z.union([OidcConfig, SamlConfig, LdapConfig]).optional().meta({ description: 'New non-secret config; shape must match the existing provider protocol (which is immutable).' }),
  secret: SecretSchema,
  jitEnabled: z.boolean().optional().meta({ description: 'Enable or disable just-in-time user provisioning on SSO login.', example: true }),
  defaultRole: RoleEnum.optional().meta({ description: 'Role for JIT-provisioned users when no mapping rule matches.', example: 'viewer' }),
  replaceUnreadableSecret: z.boolean().optional().meta({ description: 'Replace the stored secret bundle outright when it cannot be decrypted, accepting the loss of any secret not resent in this request. Without it such an update is refused with `409` so a recoverable STORE_SECRET mistake is not turned into permanent credential loss.', example: false }),
}).meta({ id: 'UpdateIdentityProviderBody', description: 'Request body to update an identity provider; omitted fields are left unchanged. Protocol is immutable.' })

const RuleSchema = z.object({
  priority: z.number().int().min(0).max(100_000).optional().meta({ description: 'Evaluation order; lower numbers are checked first and the first match wins.', example: 10 }),
  claimPath: z.string().min(1).max(200).meta({ description: 'Path to the IdP claim/attribute to test, e.g. `groups`.', example: 'groups' }),
  matchType: RoleMatchType.meta({ description: 'How `matchValue` is compared to the claim: `equals`, `contains`, or `regex`.', example: 'contains' }),
  matchValue: z.string().min(1).max(500).meta({ description: 'Value to compare against the claim using `matchType`.', example: 'opensteward-admins' }),
  role: RoleEnum.optional().meta({ description: 'Built-in role granted when this rule matches. Required unless `roleId` is given.', example: 'admin' }),
  roleId: z.string().min(1).optional().meta({ description: 'Role granted when this rule matches — a built-in id or a custom role id. Takes precedence over `role`.', example: 'operator' }),
}).refine((b) => b.role !== undefined || b.roleId !== undefined, {
  message: 'supply role or roleId',
}).meta({ id: 'CreateRoleMappingRuleBody', description: 'Request body to create a role-mapping rule for an identity provider.' })

const TenantIdList = z.array(z.string().min(1).max(64)).max(500)

const ScopeRuleSchema = z.object({
  priority: z.number().int().min(0).max(100_000).optional().meta({ description: 'Display order. Every matching scope rule applies; their tenants are unioned.', example: 100 }),
  claimPath: z.string().min(1).max(200).meta({ description: 'Path to the IdP claim/attribute to test, e.g. `groups`.', example: 'groups' }),
  matchType: RoleMatchType.meta({ description: 'How `matchValue` is compared to the claim: `equals`, `contains`, or `regex`.', example: 'equals' }),
  matchValue: z.string().min(1).max(500).meta({ description: 'Value to compare against the claim using `matchType`.', example: 'acme-support' }),
  tenantIds: TenantIdList.min(1).meta({ description: 'Tenants granted when the rule matches; `["*"]` grants every tenant.', example: ['acme'] }),
  verticals: z.union([z.literal('*'), z.array(z.string().min(1).max(64)).max(50)]).optional().meta({ description: 'Verticals within those tenants: `*` (default) for all, or a list.', example: '*' }),
}).meta({ id: 'CreateScopeMappingRuleBody', description: 'Request body to create a scope-mapping rule for an identity provider.' })

const DefaultScopeSchema = z.object({
  mode: ScopeMode.meta({ description: 'Scope when no scope rule matches: `all` tenants, or `restricted` to `tenantIds`.', example: 'restricted' }),
  tenantIds: TenantIdList.optional().meta({ description: 'Tenants granted by the default when `mode` is `restricted`; empty grants none.', example: ['default'] }),
}).meta({ id: 'UpdateIdpDefaultScopeBody', description: "Request body to set an identity provider's default tenant scope." })

const TokenMintBody = z.object({
  label: z.string().optional().meta({ description: 'Optional human-friendly label for the SCIM token.', example: 'Production key' }),
}).meta({ id: 'MintScimTokenBody', description: 'Request body to mint a SCIM provisioning token for an identity provider.' })

// Force the discriminated-union schema id into `components/schemas`. The
// surface uses the per-branch components directly via the CreateSchema
// discriminated union; this reference makes the canonical `IdpConfigByProtocol`
// schema visible to SDK consumers that prefer the protocol-keyed shape.
void IdpConfigByProtocol

const IdParam = z.object({ id: z.string() })
const IdRuleParam = z.object({ id: z.string(), ruleId: z.string() })
const IdScopeRuleParam = z.object({ id: z.string(), ruleId: z.string() })
const IdTokenParam = z.object({ id: z.string(), tokenId: z.string() })

function zodError(reply: import('fastify').FastifyReply, err: z.ZodError) {
  const first = err.issues[0]
  return reply.status(400).send({ error: `${first?.path.join('.') || 'body'}: ${first?.message ?? 'invalid'}` })
}

export function createIdentityProvidersRoutes(
  adminStore: AdminStore,
  identityStore: IdentityStore,
  config: Config,
) {
  return async function identityProvidersRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)
    fastify.addHook('preHandler', fastify.adminOnly)

    fastify.get(
      '/api/identity-providers',
      {
        schema: {
          tags: [TAG],
          summary: 'List configured identity providers',
          description:
            'List the configured SSO identity providers (SAML/OIDC) and their enabled state. Admin role required. Secrets are not returned.',
          operationId: 'identity-providers.list',
          response: {
            200: listEnvelope(IdentityProvider),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async () => {
        const data = await identityStore.listProviders()
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/api/identity-providers/:id',
      {
        schema: {
          tags: [TAG],
          summary: 'Read one identity provider',
          description:
            'Read a single identity provider\'s configuration by id (secrets redacted). Admin role required. Returns `404` if no provider matches the id.',
          operationId: 'identity-providers.get',
          params: IdParam,
          response: {
            200: dataEnvelope(IdentityProvider),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const provider = await identityStore.getProvider(request.params.id)
        if (!provider) return reply.status(404).send({ error: 'Not found' })
        return { data: provider }
      },
    )

    fastify.post(
      '/api/identity-providers',
      {
        schema: {
          tags: [TAG],
          summary: 'Create an identity provider',
          description:
            'Register a new SSO identity provider with its protocol-specific config. Admin role required. Returns `400` if the body or protocol config is invalid, and `409` if the slug is already taken. Writes an `sso.provider.create` audit entry.',
          operationId: 'identity-providers.create',
          body: CreateSchema,
          response: {
            201: dataEnvelope(IdentityProvider),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const parsed = CreateSchema.safeParse(request.body ?? {})
        if (!parsed.success) return zodError(reply, parsed.error)
        const cfg = validateConfig(parsed.data.protocol, parsed.data.config ?? {})
        if (!cfg.ok) return reply.status(400).send({ error: `config.${cfg.error}` })
        if (await identityStore.getProviderBySlug(parsed.data.slug)) {
          return reply.status(409).send({ error: 'A provider with that slug already exists' })
        }
        const provider = await identityStore.createProvider({
          name: parsed.data.name,
          slug: parsed.data.slug,
          protocol: parsed.data.protocol as IdpProtocolType,
          enabled: parsed.data.enabled,
          config: cfg.value,
          secret: parsed.data.secret,
          jitEnabled: parsed.data.jitEnabled,
          defaultRole: parsed.data.defaultRole,
          createdBy: request.jwtUser!.id,
        })
        await adminStore.writeAudit(request.jwtUser!.id, 'sso.provider.create', undefined, provider.id, {
          protocol: provider.protocol,
          slug: provider.slug,
        })
        return reply.status(201).send({ data: provider })
      },
    )

    fastify.put<{ Params: { id: string } }>(
      '/api/identity-providers/:id',
      {
        schema: {
          tags: [TAG],
          summary: 'Update an identity provider',
          description:
            'Update an identity provider\'s settings, config, or secret; omitted fields are left unchanged. Admin role required. Returns `404` if the provider is missing, `400` if the protocol config is invalid, and `409` if changing the slug collides with another provider — or if the stored secret bundle cannot be decrypted with the current STORE_SECRET, in which case nothing is written, because merging into an unreadable bundle would discard every secret not resent. Recover by restoring the previous STORE_SECRET (or running rotate-store-secret); or resend every secret with `replaceUnreadableSecret` to replace the bundle outright. Writes an `sso.provider.update` audit entry.',
          operationId: 'identity-providers.update',
          params: IdParam,
          body: UpdateSchema,
          response: {
            200: dataEnvelope(IdentityProvider),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const existing = await identityStore.getProvider(request.params.id)
        if (!existing) return reply.status(404).send({ error: 'Not found' })
        const parsed = UpdateSchema.safeParse(request.body ?? {})
        if (!parsed.success) return zodError(reply, parsed.error)
        let config: Record<string, unknown> | undefined
        if (parsed.data.config !== undefined) {
          const cfg = validateConfig(existing.protocol, parsed.data.config)
          if (!cfg.ok) return reply.status(400).send({ error: `config.${cfg.error}` })
          config = cfg.value
        }
        if (parsed.data.slug && parsed.data.slug !== existing.slug && (await identityStore.getProviderBySlug(parsed.data.slug))) {
          return reply.status(409).send({ error: 'A provider with that slug already exists' })
        }
        let updated
        try {
          updated = await identityStore.updateProvider(request.params.id, { ...parsed.data, config })
        } catch (err) {
          // Not a 500: nothing is broken on this request, and nothing was
          // written. The stored bundle cannot be decrypted with the current
          // STORE_SECRET, so a partial secret update would silently discard
          // whatever was not resent. 409 with the reason, and the operator
          // chooses: fix the key, or resend everything with
          // replaceUnreadableSecret.
          if (err instanceof UnreadableSecretUpdateRefusedError) {
            request.log.error({ err, providerId: request.params.id }, 'refused a partial secret update on an unreadable bundle')
            return reply.status(409).send({ error: err.message })
          }
          throw err
        }
        await adminStore.writeAudit(request.jwtUser!.id, 'sso.provider.update', undefined, request.params.id)
        return { data: updated }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/identity-providers/:id',
      {
        schema: {
          tags: [TAG],
          summary: 'Delete an identity provider',
          description:
            'Delete an identity provider, disabling SSO logins through it. Admin role required. Returns `404` if no provider matches the id. Writes an `sso.provider.delete` audit entry.',
          operationId: 'identity-providers.delete',
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
        const ok = await identityStore.deleteProvider(request.params.id)
        if (!ok) return reply.status(404).send({ error: 'Not found' })
        await adminStore.writeAudit(request.jwtUser!.id, 'sso.provider.delete', undefined, request.params.id)
        return reply.status(204).send()
      },
    )

    // SAML SP metadata — handed to the IdP during setup.
    fastify.get<{ Params: { id: string } }>(
      '/api/identity-providers/:id/metadata',
      {
        schema: {
          tags: [TAG],
          summary: 'SAML SP metadata XML (admin-only)',
          description:
            'Return this service\'s SAML service-provider metadata as `application/xml`, to hand to the IdP during setup (advertises the ACS URL and, when configured, the SP signing certificate). Admin role required. Returns `404` if the provider does not exist or is not a SAML provider.',
          operationId: 'identity-providers.metadata',
          params: IdParam,
          response: {
            // The body is application/xml; document only that it exists.
            200: z.string(),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const provider = await identityStore.getProvider(request.params.id)
        if (!provider || provider.protocol !== 'saml') return reply.status(404).send({ error: 'Not a SAML provider' })
        const callbackUrl = `${config.sso.publicBaseUrl.replace(/\/$/, '')}/api/sso/${provider.slug}/acs`
        // Advertise the SP signing cert when a key + cert are configured so the
        // IdP can verify our signed AuthnRequests.
        const { spPrivateKey, spCertificate } = await identityStore.getSecretBundle(provider.id)
        return reply
          .header('content-type', 'application/xml')
          .send(samlMetadata(provider, callbackUrl, { spPrivateKey, spCertificate }))
      },
    )

    // ── Role-mapping rules ──
    fastify.get<{ Params: { id: string } }>(
      '/api/identity-providers/:id/role-mappings',
      {
        schema: {
          tags: [TAG],
          summary: 'List a provider\'s role-mapping rules',
          description:
            'List the role-mapping rules for one provider — the rules that translate IdP claims/groups into local roles on SSO login. Admin role required. Returns `404` if the provider does not exist.',
          operationId: 'identity-providers.role-mappings.list',
          params: IdParam,
          response: {
            200: listEnvelope(RoleMappingRule),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!(await identityStore.getProvider(request.params.id))) return reply.status(404).send({ error: 'Not found' })
        const data = await identityStore.listRules(request.params.id)
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api/identity-providers/:id/role-mappings',
      {
        schema: {
          tags: [TAG],
          summary: 'Create a role-mapping rule',
          description:
            'Add a role-mapping rule to a provider, mapping an IdP claim/group to a local role — a built-in `role`, or any role (built-in or custom) by `roleId`. Admin role required. Returns `404` if the provider does not exist, `400` if the rule body is invalid or `roleId` is unknown, and `403` if the role grants a permission or base role you do not hold. Writes an `sso.role_mapping.create` audit entry.',
          operationId: 'identity-providers.role-mappings.create',
          params: IdParam,
          body: RuleSchema,
          response: {
            201: dataEnvelope(RoleMappingRule),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!(await identityStore.getProvider(request.params.id))) return reply.status(404).send({ error: 'Not found' })
        const parsed = RuleSchema.safeParse(request.body ?? {})
        if (!parsed.success) return zodError(reply, parsed.error)
        const { roleId: requestedRoleId, role: requestedRole, ...ruleFields } = parsed.data
        // A rule hands a role to everyone the IdP says matches, so it is a
        // grant like any other: nothing the caller does not hold themselves.
        const caller = await callerContext(request)
        let role = requestedRole ?? 'viewer'
        let roleId: string | null = null
        if (requestedRoleId !== undefined) {
          const target = await adminStore.getRole(requestedRoleId)
          if (!target) return reply.status(400).send({ error: `Unknown role: ${requestedRoleId}` })
          const refusal = roleGrantRefusal(caller, target)
          if (refusal) return reply.status(403).send({ error: refusal })
          role = target.baseRole
          roleId = target.isBuiltin ? null : target.id
        } else {
          const refusal = roleGrantRefusal(caller, {
            permissions: BUILTIN_ROLE_PERMISSIONS[role],
            baseRole: role,
          })
          if (refusal) return reply.status(403).send({ error: refusal })
        }
        const rule = await identityStore.createRule({
          providerId: request.params.id,
          ...ruleFields,
          role,
          roleId,
        })
        await adminStore.writeAudit(request.jwtUser!.id, 'sso.role_mapping.create', undefined, request.params.id, {
          role: rule.role,
        })
        return reply.status(201).send({ data: rule })
      },
    )

    fastify.delete<{ Params: { id: string; ruleId: string } }>(
      '/api/identity-providers/:id/role-mappings/:ruleId',
      {
        schema: {
          tags: [TAG],
          summary: 'Delete a role-mapping rule',
          description:
            'Delete a single role-mapping rule from a provider. Admin role required. Returns `404` if the rule (or provider) does not exist. Writes an `sso.role_mapping.delete` audit entry.',
          operationId: 'identity-providers.role-mappings.delete',
          params: IdRuleParam,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const ok = await identityStore.deleteRule(Number(request.params.ruleId), request.params.id)
        if (!ok) return reply.status(404).send({ error: 'Not found' })
        await adminStore.writeAudit(request.jwtUser!.id, 'sso.role_mapping.delete', undefined, request.params.id)
        return reply.status(204).send()
      },
    )

    // ── Scope-mapping rules + default scope ──
    // Gated on `users:manage` on top of the admin role: these decide which
    // tenants every SSO user of the provider sees.
    const usersManage = { preHandler: [requirePermission('users:manage')] }

    async function unknownTenants(ids: readonly string[]): Promise<string[]> {
      const known = new Set((await adminStore.listTenants()).map((t) => t.id))
      return [...new Set(ids)].filter((id) => id !== '*' && !known.has(id))
    }

    fastify.get<{ Params: { id: string } }>(
      '/api/identity-providers/:id/scope-rules',
      {
        ...usersManage,
        schema: {
          tags: [TAG],
          summary: "List a provider's scope-mapping rules",
          description:
            'List the scope-mapping rules for one provider — the rules that grant tenant scope from IdP claims/groups on SSO login. Every matching rule applies (the tenants are unioned); when none match, the provider default scope applies. Admin role and `users:manage` required. Returns `404` if the provider does not exist.',
          operationId: 'identity-providers.scope-rules.list',
          params: IdParam,
          response: {
            200: listEnvelope(ScopeMappingRule),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!(await identityStore.getProvider(request.params.id))) return reply.status(404).send({ error: 'Not found' })
        const data = await identityStore.listScopeRules(request.params.id)
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api/identity-providers/:id/scope-rules',
      {
        ...usersManage,
        schema: {
          tags: [TAG],
          summary: 'Create a scope-mapping rule',
          description:
            'Add a scope-mapping rule: users whose claim matches may see the listed tenants (`["*"]` = every tenant), optionally only some verticals. Applied on each SSO login and SCIM group change to users whose scope is IdP-owned (`scopeSource: idp`, the default for JIT and SCIM users). Admin role and `users:manage` required. Returns `404` if the provider does not exist, `400` for an invalid body or unknown tenant, and `403` when the rule grants tenants outside your own scope. Writes an `idp.scope_rule.create` audit entry.',
          operationId: 'identity-providers.scope-rules.create',
          params: IdParam,
          body: ScopeRuleSchema,
          response: {
            201: dataEnvelope(ScopeMappingRule),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!(await identityStore.getProvider(request.params.id))) return reply.status(404).send({ error: 'Not found' })
        const parsed = ScopeRuleSchema.safeParse(request.body ?? {})
        if (!parsed.success) return zodError(reply, parsed.error)
        const unknown = await unknownTenants(parsed.data.tenantIds)
        if (unknown.length > 0) return reply.status(400).send({ error: `Unknown tenant(s): ${unknown.join(', ')}` })
        const everyTenant = parsed.data.tenantIds.includes('*')
        const verticals = parsed.data.verticals ?? '*'
        const allowed = callerMayGrantScope(await callerContext(request), {
          mode: everyTenant ? 'all' : 'restricted',
          grants: parsed.data.tenantIds.map((tenantId) => ({ tenantId, verticals })),
        })
        if (!allowed) return reply.status(403).send({ error: 'You cannot grant tenants outside your own scope' })
        const rule = await identityStore.createScopeRule({ providerId: request.params.id, ...parsed.data })
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'idp.scope_rule.create',
          targetId: String(rule.id),
          detail: { providerId: request.params.id },
        })
        return reply.status(201).send({ data: rule })
      },
    )

    fastify.delete<{ Params: { id: string; ruleId: string } }>(
      '/api/identity-providers/:id/scope-rules/:ruleId',
      {
        ...usersManage,
        schema: {
          tags: [TAG],
          summary: 'Delete a scope-mapping rule',
          description:
            'Delete a single scope-mapping rule from a provider. Takes effect for each affected user at their next SSO login. Admin role and `users:manage` required. Returns `404` if the rule (or provider) does not exist. Writes an `idp.scope_rule.delete` audit entry.',
          operationId: 'identity-providers.scope-rules.delete',
          params: IdScopeRuleParam,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const ok = await identityStore.deleteScopeRule(Number(request.params.ruleId), request.params.id)
        if (!ok) return reply.status(404).send({ error: 'Not found' })
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'idp.scope_rule.delete',
          targetId: request.params.ruleId,
          detail: { providerId: request.params.id },
        })
        return reply.status(204).send()
      },
    )

    fastify.patch<{ Params: { id: string } }>(
      '/api/identity-providers/:id/default-scope',
      {
        ...usersManage,
        schema: {
          tags: [TAG],
          summary: "Set a provider's default tenant scope",
          description:
            'Set the scope SSO users of this provider get when no scope rule matches: `all` tenants (the default, and what every provider had before scope rules existed) or `restricted` to `tenantIds` (empty = no tenants). Admin role and `users:manage` required. Returns `404` if the provider does not exist, `400` for an unknown tenant, and `403` when the scope reaches beyond your own. Writes an `idp.default_scope.update` audit entry.',
          operationId: 'identity-providers.default-scope.update',
          params: IdParam,
          body: DefaultScopeSchema,
          response: {
            200: dataEnvelope(IdentityProvider),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!(await identityStore.getProvider(request.params.id))) return reply.status(404).send({ error: 'Not found' })
        const parsed = DefaultScopeSchema.safeParse(request.body ?? {})
        if (!parsed.success) return zodError(reply, parsed.error)
        const tenantIds = parsed.data.mode === 'restricted' ? (parsed.data.tenantIds ?? []) : []
        const unknown = await unknownTenants(tenantIds)
        if (unknown.length > 0 || tenantIds.includes('*')) {
          return reply.status(400).send({ error: `Unknown tenant(s): ${[...unknown, ...tenantIds.filter((t) => t === '*')].join(', ')}` })
        }
        const allowed = callerMayGrantScope(await callerContext(request), {
          mode: parsed.data.mode,
          grants: tenantIds.map((tenantId) => ({ tenantId, verticals: '*' as const })),
        })
        if (!allowed) return reply.status(403).send({ error: 'You cannot grant tenants outside your own scope' })
        const updated = await identityStore.updateProviderDefaultScope(request.params.id, {
          mode: parsed.data.mode,
          tenantIds,
        })
        if (!updated) return reply.status(404).send({ error: 'Not found' })
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'idp.default_scope.update',
          targetId: request.params.id,
          detail: { mode: updated.defaultScopeMode, tenantIds: updated.defaultTenantIds },
        })
        return { data: updated }
      },
    )

    // ── SCIM tokens ──
    fastify.get<{ Params: { id: string } }>(
      '/api/identity-providers/:id/scim-tokens',
      {
        schema: {
          tags: [TAG],
          summary: 'List SCIM bearer tokens for a provider',
          description:
            'List the SCIM bearer tokens issued for a provider (used by the IdP to provision/deprovision users via SCIM). Admin role required. Plaintext token values are not returned. Returns `404` if the provider does not exist.',
          operationId: 'identity-providers.scim-tokens.list',
          params: IdParam,
          response: {
            200: listEnvelope(ScimToken),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!(await identityStore.getProvider(request.params.id))) return reply.status(404).send({ error: 'Not found' })
        const data = await identityStore.listScimTokens(request.params.id)
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.post<{ Params: { id: string }; Body: { label?: string } }>(
      '/api/identity-providers/:id/scim-tokens',
      {
        schema: {
          tags: [TAG],
          summary: 'Mint a SCIM bearer token (plaintext returned once)',
          description:
            'Mint a new SCIM bearer token for a provider. Admin role required. The response includes the plaintext token **once** — it cannot be retrieved again. Returns `404` if the provider does not exist. Writes an `sso.scim_token.mint` audit entry.',
          operationId: 'identity-providers.scim-tokens.create',
          params: IdParam,
          body: TokenMintBody,
          response: {
            201: dataEnvelope(ScimTokenMint),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!(await identityStore.getProvider(request.params.id))) return reply.status(404).send({ error: 'Not found' })
        const mint = await identityStore.mintScimToken({
          providerId: request.params.id,
          label: request.body?.label ?? null,
          createdBy: request.jwtUser!.id,
        })
        await adminStore.writeAudit(request.jwtUser!.id, 'sso.scim_token.mint', undefined, request.params.id)
        return reply.status(201).send({ data: mint })
      },
    )

    fastify.delete<{ Params: { id: string; tokenId: string } }>(
      '/api/identity-providers/:id/scim-tokens/:tokenId',
      {
        schema: {
          tags: [TAG],
          summary: 'Revoke a SCIM bearer token',
          description:
            'Revoke a SCIM bearer token by id, effective immediately. Admin role required. Returns `404` if no token matches the id. Writes an `sso.scim_token.revoke` audit entry.',
          operationId: 'identity-providers.scim-tokens.delete',
          params: IdTokenParam,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const ok = await identityStore.revokeScimToken(request.params.tokenId)
        if (!ok) return reply.status(404).send({ error: 'Not found' })
        await adminStore.writeAudit(request.jwtUser!.id, 'sso.scim_token.revoke', undefined, request.params.tokenId)
        return reply.status(204).send()
      },
    )
  }
}

// Re-export for tests that build identities directly.
export type { ResolvedIdentity }
export { isRole }
