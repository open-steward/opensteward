/**
 * Typed registry of every `audit_log.action` recognised by admin-api.
 *
 * Every `writeAudit` caller is forced through this registry so the
 * `detail` payload shape is tied to the literal `action` value. The
 * registry is also the source of truth for the `AuditEntry` OpenAPI
 * schema: `detail` is documented as a `discriminatedUnion('action', …)`
 * with one named component per variant, so SDK consumers and Swagger UI
 * users see the real shape instead of an opaque `Record<string, unknown>`.
 *
 * Each variant in `AuditDetailUnion` is a flat object containing the
 * literal `action` discriminator alongside the per-action payload
 * fields. Storage in the SQLite `audit_log` table keeps the inner
 * payload only (the `action` value is already in its own column); the
 * audit-list route reassembles the variant by combining `action` with
 * the parsed `detail` JSON before sending it over the wire. This keeps
 * the schema discriminator OAS-correct (the discriminator field lives
 * inside the variant) without forcing duplicate storage.
 *
 * Adding a new audit action is a 3-step move:
 *   1. Add the literal + payload schema to the union below.
 *   2. Call `writeAudit({ action: '<new>', detail: …, … })` from the writer.
 *   3. Regenerate docs (`pnpm docs:all`).
 *
 * TypeScript catches drift in step 2 — if the detail shape doesn't match
 * the registry entry from step 1, the writer fails to compile.
 *
 * NOTE: this is a type-narrowing exercise. The underlying `audit_log`
 * table still stores `detail` as a JSON string; the discriminated union
 * is enforced at the application boundary (writeAudit) and parsed back
 * out at the read boundary (`GET /api/audit`).
 */
import { z } from 'zod'
import 'fastify-zod-openapi'
import { SYNC_MODES } from '@opensteward/shared'

// Inlined to avoid a circular import with `routes/_openapi.ts` (which
// imports `AuditDetailUnion` from this file). The set of admin roles is
// already pinned by the user-routes layer; the registry just needs the
// enum literal at write time.
const RoleEnum = z.enum(['admin', 'operator', 'viewer'])

// ── Per-action variants ───────────────────────────────────────────────────
//
// Order roughly matches the lifecycle a fresh install sees: schema boot,
// then user auth, then SSO, then resources, then settings. Every
// variant is a flat object with the literal `action` discriminator and
// the per-action payload fields — this lets the OAS `discriminator`
// object render correctly in Swagger UI (the field has to live inside
// the variant, not on a wrapping object).

const SchemaMigrate = z
  .object({
    action: z.literal('schema.migrate').meta({
      description: 'Action code identifying this audit variant.',
      example: 'schema.migrate',
    }),
    version: z.number().meta({ description: 'Schema version that was applied.', example: 12 }),
    durationMs: z
      .number()
      .meta({ description: 'How long the migration took, in milliseconds.', example: 184 }),
  })
  .meta({
    id: 'AuditDetailSchemaMigrate',
    description: 'Audit detail for a schema migration being applied.',
  })

const UserCreate = z
  .object({
    action: z
      .literal('user.create')
      .meta({ description: 'Action code identifying this audit variant.', example: 'user.create' }),
    username: z
      .string()
      .meta({ description: 'Login name of the user that was created.', example: 'olivia.admin' }),
    role: RoleEnum.meta({ description: 'Role assigned to the new user.', example: 'admin' }),
    emailSet: z.boolean().optional().meta({
      description: 'True when the account was created with an email address. The address itself is never recorded.',
      example: true,
    }),
  })
  .meta({ id: 'AuditDetailUserCreate' })

const UserUpdate = z
  .object({
    action: z.literal('user.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'user.update',
    }),
    emailChanged: z.boolean().optional().meta({
      description:
        'True when the update set, changed or cleared the email address. The address itself is never recorded.',
      example: true,
    }),
    role: z.string().optional().meta({
      description: 'The new role, when the update changed it.',
      example: 'operator',
    }),
    scopeCleared: z.boolean().optional().meta({
      description: 'True when the change made the user an admin and so lifted their tenant restriction.',
      example: true,
    }),
    passwordChanged: z.boolean().optional().meta({
      description: 'True when the update reset the password. The password itself is never recorded.',
      example: true,
    }),
  })
  .meta({ id: 'AuditDetailUserUpdate' })

const UserDelete = z
  .object({
    action: z
      .literal('user.delete')
      .meta({ description: 'Action code identifying this audit variant.', example: 'user.delete' }),
  })
  .meta({ id: 'AuditDetailUserDelete' })

const UserLogin = z
  .object({
    action: z
      .literal('user.login')
      .meta({ description: 'Action code identifying this audit variant.', example: 'user.login' }),
  })
  .meta({ id: 'AuditDetailUserLogin' })

const UserLockoutTemporary = z
  .object({
    action: z.literal('user.lockout.temporary').meta({
      description: 'Action code identifying this audit variant.',
      example: 'user.lockout.temporary',
    }),
    failures: z.number().meta({
      description: 'Consecutive failed login attempts that triggered the temporary lockout.',
      example: 5,
    }),
  })
  .meta({ id: 'AuditDetailUserLockoutTemporary' })

const UserLockoutPermanent = z
  .object({
    action: z.literal('user.lockout.permanent').meta({
      description: 'Action code identifying this audit variant.',
      example: 'user.lockout.permanent',
    }),
    failures: z.number().meta({
      description: 'Consecutive failed login attempts that triggered the permanent lockout.',
      example: 10,
    }),
  })
  .meta({ id: 'AuditDetailUserLockoutPermanent' })

// SSO login is written by two slightly different code paths (OIDC/SAML
// vs LDAP); the LDAP branch tags `protocol: 'ldap'` and omits the
// `roleChanged` flag. We accept the union of both at write time and
// surface every key as optional in the registry so neither call site
// has to ferry around fields it doesn't track.
const SsoLogin = z
  .object({
    action: z
      .literal('sso.login')
      .meta({ description: 'Action code identifying this audit variant.', example: 'sso.login' }),
    created: z.boolean().meta({
      description: 'True if the user was just-in-time provisioned during this login.',
      example: false,
    }),
    role: RoleEnum.meta({
      description: 'Role the user holds after this SSO login.',
      example: 'viewer',
    }),
    roleChanged: z.boolean().optional().meta({
      description:
        'True if role mapping changed the user’s role on this login (OIDC/SAML paths only).',
      example: false,
    }),
    protocol: z.literal('ldap').optional().meta({
      description: 'Present and set to `ldap` when the login came via the LDAP path.',
      example: 'ldap',
    }),
  })
  .meta({ id: 'AuditDetailSsoLogin' })

const SsoProviderCreate = z
  .object({
    action: z.literal('sso.provider.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.provider.create',
    }),
    protocol: z.enum(['saml', 'oidc', 'ldap']).meta({
      description: 'Protocol of the identity provider that was created.',
      example: 'oidc',
    }),
    slug: z
      .string()
      .meta({ description: 'Slug assigned to the new identity provider.', example: 'northwind' }),
  })
  .meta({ id: 'AuditDetailSsoProviderCreate' })

const SsoProviderUpdate = z
  .object({
    action: z.literal('sso.provider.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.provider.update',
    }),
  })
  .meta({ id: 'AuditDetailSsoProviderUpdate' })

const SsoProviderDelete = z
  .object({
    action: z.literal('sso.provider.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.provider.delete',
    }),
  })
  .meta({ id: 'AuditDetailSsoProviderDelete' })

const SsoRoleMappingCreate = z
  .object({
    action: z.literal('sso.role_mapping.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.role_mapping.create',
    }),
    role: RoleEnum.meta({ description: 'Role the created mapping rule grants.', example: 'admin' }),
  })
  .meta({ id: 'AuditDetailSsoRoleMappingCreate' })

const SsoRoleMappingDelete = z
  .object({
    action: z.literal('sso.role_mapping.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.role_mapping.delete',
    }),
  })
  .meta({ id: 'AuditDetailSsoRoleMappingDelete' })

const SsoScimTokenMint = z
  .object({
    action: z.literal('sso.scim_token.mint').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.scim_token.mint',
    }),
  })
  .meta({ id: 'AuditDetailSsoScimTokenMint' })

const SsoScimTokenRevoke = z
  .object({
    action: z.literal('sso.scim_token.revoke').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.scim_token.revoke',
    }),
  })
  .meta({ id: 'AuditDetailSsoScimTokenRevoke' })

// Every SCIM mutation carries the originating IdP provider id so the
// audit log can be filtered per-provider when investigating sync issues.
const SsoScimProvision = z
  .object({
    action: z.literal('sso.scim.provision').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.scim.provision',
    }),
    providerId: z.string().meta({
      description: 'Identity provider the SCIM operation originated from (prefix `idp_`).',
      example: 'idp_northwind',
    }),
  })
  .meta({ id: 'AuditDetailSsoScimProvision' })

const SsoScimDeprovision = z
  .object({
    action: z.literal('sso.scim.deprovision').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.scim.deprovision',
    }),
    providerId: z.string().meta({
      description: 'Identity provider the SCIM operation originated from (prefix `idp_`).',
      example: 'idp_northwind',
    }),
  })
  .meta({ id: 'AuditDetailSsoScimDeprovision' })

const SsoScimGroupCreate = z
  .object({
    action: z.literal('sso.scim.group.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.scim.group.create',
    }),
    providerId: z.string().meta({
      description: 'Identity provider the SCIM operation originated from (prefix `idp_`).',
      example: 'idp_northwind',
    }),
  })
  .meta({ id: 'AuditDetailSsoScimGroupCreate' })

const SsoScimGroupUpdate = z
  .object({
    action: z.literal('sso.scim.group.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.scim.group.update',
    }),
    providerId: z.string().meta({
      description: 'Identity provider the SCIM operation originated from (prefix `idp_`).',
      example: 'idp_northwind',
    }),
  })
  .meta({ id: 'AuditDetailSsoScimGroupUpdate' })

const SsoScimGroupDelete = z
  .object({
    action: z.literal('sso.scim.group.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sso.scim.group.delete',
    }),
    providerId: z.string().meta({
      description: 'Identity provider the SCIM operation originated from (prefix `idp_`).',
      example: 'idp_northwind',
    }),
  })
  .meta({ id: 'AuditDetailSsoScimGroupDelete' })

const ConnectLinkTemplateCreate = z
  .object({
    action: z.literal('connect_link_template.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'connect_link_template.create',
    }),
    name: z.string().meta({
      description: 'Name of the affected connect-link template.',
      example: 'Acme onboarding',
    }),
    tenantId: z.string().meta({ description: 'Tenant the template belongs to.', example: 'acme' }),
  })
  .meta({ id: 'AuditDetailConnectLinkTemplateCreate' })

const ConnectLinkTemplateUpdate = z
  .object({
    action: z.literal('connect_link_template.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'connect_link_template.update',
    }),
    name: z.string().meta({
      description: 'Name of the affected connect-link template.',
      example: 'Acme onboarding',
    }),
    tenantId: z.string().meta({ description: 'Tenant the template belongs to.', example: 'acme' }),
  })
  .meta({ id: 'AuditDetailConnectLinkTemplateUpdate' })

const ConnectLinkTemplateDelete = z
  .object({
    action: z.literal('connect_link_template.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'connect_link_template.delete',
    }),
    name: z.string().meta({
      description: 'Name of the affected connect-link template.',
      example: 'Acme onboarding',
    }),
    tenantId: z.string().meta({ description: 'Tenant the template belongs to.', example: 'acme' }),
  })
  .meta({ id: 'AuditDetailConnectLinkTemplateDelete' })

const ConnectSessionCreate = z
  .object({
    action: z.literal('connect_session.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'connect_session.create',
    }),
  })
  .meta({ id: 'AuditDetailConnectSessionCreate' })

const ConnectSessionRevoke = z
  .object({
    action: z.literal('connect_session.revoke').meta({
      description: 'Action code identifying this audit variant.',
      example: 'connect_session.revoke',
    }),
  })
  .meta({ id: 'AuditDetailConnectSessionRevoke' })

const ConnectionCreate = z
  .object({
    action: z.literal('connection.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'connection.create',
    }),
  })
  .meta({ id: 'AuditDetailConnectionCreate' })

const ConnectionDelete = z
  .object({
    action: z.literal('connection.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'connection.delete',
    }),
  })
  .meta({ id: 'AuditDetailConnectionDelete' })

const ConnectionUpdate = z
  .object({
    action: z.literal('connection.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'connection.update',
    }),
  })
  .meta({ id: 'AuditDetailConnectionUpdate' })

const AuditSyncSchedule = z
  .object({
    mode: z.enum(SYNC_MODES).meta({ description: 'Sync schedule mode.', example: 'custom' }),
    intervalMinutes: z.number().int().nullable().meta({
      description: 'Minutes between syncs for a `custom` schedule; null otherwise.',
      example: 120,
    }),
  })
  .meta({ id: 'AuditConnectionSyncSchedule', description: "A connection's sync schedule." })

const ConnectionSyncSchedule = z
  .object({
    action: z.literal('connection.sync_schedule').meta({
      description: 'Action code identifying this audit variant.',
      example: 'connection.sync_schedule',
    }),
    from: AuditSyncSchedule,
    to: AuditSyncSchedule,
  })
  .meta({
    id: 'AuditDetailConnectionSyncSchedule',
    description:
      "Audit detail for changing a connection's sync schedule: the schedule before and after.",
  })

const ApiKeyMint = z
  .object({
    action: z.literal('api_key.mint').meta({
      description: 'Action code identifying this audit variant.',
      example: 'api_key.mint',
    }),
  })
  .meta({ id: 'AuditDetailApiKeyMint' })

const ApiKeyRevoke = z
  .object({
    action: z.literal('api_key.revoke').meta({
      description: 'Action code identifying this audit variant.',
      example: 'api_key.revoke',
    }),
  })
  .meta({ id: 'AuditDetailApiKeyRevoke' })

const ApiKeyRotate = z
  .object({
    action: z.literal('api_key.rotate').meta({
      description: 'Action code identifying this audit variant.',
      example: 'api_key.rotate',
    }),
    replacementId: z.string().optional().meta({
      description: 'Id of the replacement key minted by the rotation.',
      example: 'a81bc81b-dead-4e5d-abff-90865d1e13b1',
    }),
    oldKeyRevokeAt: z.number().optional().meta({
      description: 'Epoch ms when the rotated key\'s grace window ends.',
      example: 1774137600000,
    }),
  })
  .meta({ id: 'AuditDetailApiKeyRotate' })

const EndUserCreate = z
  .object({
    action: z.literal('end_user.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'end_user.create',
    }),
  })
  .meta({ id: 'AuditDetailEndUserCreate' })

const EndUserUpdate = z
  .object({
    action: z.literal('end_user.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'end_user.update',
    }),
  })
  .meta({ id: 'AuditDetailEndUserUpdate' })

const EndUserDelete = z
  .object({
    action: z.literal('end_user.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'end_user.delete',
    }),
  })
  .meta({ id: 'AuditDetailEndUserDelete' })

const UserPiiReveal = z
  .object({
    action: z.literal('user.pii_reveal').meta({
      description: 'Action code identifying this audit variant.',
      example: 'user.pii_reveal',
    }),
  })
  .meta({ id: 'AuditDetailUserPiiReveal' })

const UserAvatarUpdate = z
  .object({
    action: z.literal('user.avatar_update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'user.avatar_update',
    }),
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']).meta({
      description: 'Image type identified from the uploaded bytes (never the client-declared type).',
      example: 'image/png',
    }),
    byteSize: z.number().meta({ description: 'Size of the stored picture in bytes.', example: 48213 }),
  })
  .meta({
    id: 'AuditDetailUserAvatarUpdate',
    description: 'Audit detail for a profile picture uploaded to a console account (`targetId` is the account).',
  })

const UserAvatarDelete = z
  .object({
    action: z.literal('user.avatar_delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'user.avatar_delete',
    }),
  })
  .meta({ id: 'AuditDetailUserAvatarDelete' })

const EndUserPiiReveal = z
  .object({
    action: z.literal('end_user.pii_reveal').meta({
      description: 'Action code identifying this audit variant.',
      example: 'end_user.pii_reveal',
    }),
  })
  .meta({ id: 'AuditDetailEndUserPiiReveal' })

const EndUserTokenMint = z
  .object({
    action: z.literal('end_user_token.mint').meta({
      description: 'Action code identifying this audit variant.',
      example: 'end_user_token.mint',
    }),
  })
  .meta({ id: 'AuditDetailEndUserTokenMint' })

const EndUserTokenRevoke = z
  .object({
    action: z.literal('end_user_token.revoke').meta({
      description: 'Action code identifying this audit variant.',
      example: 'end_user_token.revoke',
    }),
  })
  .meta({ id: 'AuditDetailEndUserTokenRevoke' })

const WebhookSubCreate = z
  .object({
    action: z.literal('webhook_sub.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'webhook_sub.create',
    }),
  })
  .meta({ id: 'AuditDetailWebhookSubCreate' })

const WebhookSubDelete = z
  .object({
    action: z.literal('webhook_sub.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'webhook_sub.delete',
    }),
  })
  .meta({ id: 'AuditDetailWebhookSubDelete' })

const WebhookSubPause = z
  .object({
    action: z.literal('webhook_sub.pause').meta({
      description: 'Action code identifying this audit variant.',
      example: 'webhook_sub.pause',
    }),
  })
  .meta({ id: 'AuditDetailWebhookSubPause' })

const WebhookSubRotateSecret = z
  .object({
    action: z.literal('webhook_sub.rotate_secret').meta({
      description: 'Action code identifying this audit variant.',
      example: 'webhook_sub.rotate_secret',
    }),
  })
  .meta({ id: 'AuditDetailWebhookSubRotateSecret' })

const WebhookSubUpdate = z
  .object({
    action: z.literal('webhook_sub.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'webhook_sub.update',
    }),
  })
  .meta({ id: 'AuditDetailWebhookSubUpdate' })

const WebhookSubTest = z
  .object({
    action: z.literal('webhook_sub.test').meta({
      description: 'Action code identifying this audit variant.',
      example: 'webhook_sub.test',
    }),
  })
  .meta({ id: 'AuditDetailWebhookSubTest' })

const WebhookDeliveryReplay = z
  .object({
    action: z.literal('webhook_delivery.replay').meta({
      description: 'Action code identifying this audit variant.',
      example: 'webhook_delivery.replay',
    }),
  })
  .meta({ id: 'AuditDetailWebhookDeliveryReplay' })

const SyncJobCreate = z
  .object({
    action: z.literal('sync_job.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sync_job.create',
    }),
  })
  .meta({ id: 'AuditDetailSyncJobCreate' })

const SyncJobCancel = z
  .object({
    action: z.literal('sync_job.cancel').meta({
      description: 'Action code identifying this audit variant.',
      example: 'sync_job.cancel',
    }),
  })
  .meta({ id: 'AuditDetailSyncJobCancel' })

const CompanyInfoUpdate = z
  .object({
    action: z.literal('company_info.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'company_info.update',
    }),
  })
  .meta({ id: 'AuditDetailCompanyInfoUpdate' })

const CompanyInfoReset = z
  .object({
    action: z.literal('company_info.reset').meta({
      description: 'Action code identifying this audit variant.',
      example: 'company_info.reset',
    }),
  })
  .meta({ id: 'AuditDetailCompanyInfoReset' })

// Runtime-setting before/after carry whatever shape the setting holds —
// scalar, array, object, null. `z.unknown()` keeps the writer free to
// pass the typed value without an extra cast, while the discriminated
// union still pins the *outer* shape (presence of before+after).
const RuntimeSettingUpdate = z
  .object({
    action: z.literal('runtime_setting.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'runtime_setting.update',
    }),
    before: z.unknown().meta({
      description: 'Previous value of the setting before the update; type matches the setting.',
      example: 300,
    }),
    after: z.unknown().meta({
      description: 'New value of the setting after the update; type matches the setting.',
      example: 600,
    }),
  })
  .meta({ id: 'AuditDetailRuntimeSettingUpdate' })

const OAuthIssuerCreate = z
  .object({
    action: z.literal('oauth_issuer.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'oauth_issuer.create',
    }),
    name: z
      .string()
      .meta({
        description: 'Operator-facing label given to the issuer.',
        example: 'Corp Keycloak',
      }),
    issuer: z
      .string()
      .meta({
        description: 'The iss value tokens must carry.',
        example: 'https://idp.corp.example/realms/main',
      }),
    authorityMode: z.string().meta({
      description:
        'Where tenant and scopes will come from. `external` is the one worth noticing in an audit trail: it means tokens carry their own authority and cannot be revoked before they expire.',
      example: 'registry',
    }),
  })
  .meta({ id: 'AuditDetailOAuthIssuerCreate' })

const OAuthIssuerUpdate = z
  .object({
    action: z.literal('oauth_issuer.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'oauth_issuer.update',
    }),
    name: z
      .string()
      .meta({ description: 'Operator-facing label of the issuer.', example: 'Corp Keycloak' }),
    changed: z.array(z.string()).meta({
      description: 'Which fields the operator submitted. Never the values, and never a token.',
      example: ['authorityMode', 'allowedTenants'],
    }),
  })
  .meta({ id: 'AuditDetailOAuthIssuerUpdate' })

const OAuthIssuerDelete = z
  .object({
    action: z.literal('oauth_issuer.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'oauth_issuer.delete',
    }),
    name: z
      .string()
      .meta({ description: 'Label of the deleted issuer.', example: 'Corp Keycloak' }),
    issuer: z
      .string()
      .meta({
        description: 'The iss value it accepted.',
        example: 'https://idp.corp.example/realms/main',
      }),
  })
  .meta({ id: 'AuditDetailOAuthIssuerDelete' })

const OAuthClientCreate = z
  .object({
    action: z.literal('oauth_client.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'oauth_client.create',
    }),
    subject: z
      .string()
      .meta({
        description: 'Subject claim value identifying the service account.',
        example: 'billing-service',
      }),
    tenantId: z.string().meta({ description: 'Tenant it authenticates as.', example: 'acme' }),
    scopes: z.array(z.string()).meta({
      description: 'Scopes granted to it.',
      example: ['customers:read', 'vertical:read'],
    }),
  })
  .meta({ id: 'AuditDetailOAuthClientCreate' })

const OAuthClientRevoke = z
  .object({
    action: z.literal('oauth_client.revoke').meta({
      description: 'Action code identifying this audit variant.',
      example: 'oauth_client.revoke',
    }),
    subject: z
      .string()
      .meta({
        description: 'Subject claim value of the revoked service account.',
        example: 'billing-service',
      }),
  })
  .meta({ id: 'AuditDetailOAuthClientRevoke' })

const RuntimeSettingReset = z
  .object({
    action: z.literal('runtime_setting.reset').meta({
      description: 'Action code identifying this audit variant.',
      example: 'runtime_setting.reset',
    }),
    before: z
      .unknown()
      .meta({ description: 'Value before the reset; type matches the setting.', example: 600 }),
    after: z.unknown().meta({
      description: 'Value after resetting to the built-in default; type matches the setting.',
      example: 300,
    }),
  })
  .meta({ id: 'AuditDetailRuntimeSettingReset' })

const AdapterEnable = z
  .object({
    action: z.literal('adapter.enable').meta({
      description: 'Action code identifying this audit variant.',
      example: 'adapter.enable',
    }),
  })
  .meta({ id: 'AuditDetailAdapterEnable' })

const AdapterDisable = z
  .object({
    action: z.literal('adapter.disable').meta({
      description: 'Action code identifying this audit variant.',
      example: 'adapter.disable',
    }),
  })
  .meta({ id: 'AuditDetailAdapterDisable' })

const AdapterConfig = z
  .object({
    action: z.literal('adapter.config').meta({
      description: 'Action code identifying this audit variant.',
      example: 'adapter.config',
    }),
  })
  .meta({ id: 'AuditDetailAdapterConfig' })

const ScopeGroupCreate = z
  .object({
    action: z.literal('scope_group.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'scope_group.create',
    }),
    name: z
      .string()
      .meta({ description: 'Name of the affected scope group.', example: 'Accounting read' }),
    platform: z
      .string()
      .meta({ description: 'Platform slug the scope group targets.', example: 'xero' }),
  })
  .meta({ id: 'AuditDetailScopeGroupCreate' })

const ScopeGroupUpdate = z
  .object({
    action: z.literal('scope_group.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'scope_group.update',
    }),
    name: z
      .string()
      .meta({ description: 'Name of the affected scope group.', example: 'Accounting read' }),
    platform: z
      .string()
      .meta({ description: 'Platform slug the scope group targets.', example: 'xero' }),
  })
  .meta({ id: 'AuditDetailScopeGroupUpdate' })

const ScopeGroupDelete = z
  .object({
    action: z.literal('scope_group.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'scope_group.delete',
    }),
    name: z
      .string()
      .meta({ description: 'Name of the affected scope group.', example: 'Accounting read' }),
    platform: z
      .string()
      .meta({ description: 'Platform slug the scope group targets.', example: 'xero' }),
  })
  .meta({ id: 'AuditDetailScopeGroupDelete' })

// Audit-log self-management: who exported the log (and in what shape) and the
// automated retention sweep that prunes rows past their retention window.
const AuditExport = z
  .object({
    action: z.literal('audit.export').meta({
      description: 'Action code identifying this audit variant.',
      example: 'audit.export',
    }),
    format: z
      .enum(['csv', 'json'])
      .meta({ description: 'Export format requested: `csv` or `json`.', example: 'csv' }),
    count: z
      .number()
      .meta({ description: 'Number of audit entries included in the export.', example: 1042 }),
  })
  .meta({ id: 'AuditDetailAuditExport' })

const AuditRetentionPrune = z
  .object({
    action: z.literal('audit.retention.prune').meta({
      description: 'Action code identifying this audit variant.',
      example: 'audit.retention.prune',
    }),
    deleted: z
      .number()
      .meta({ description: 'Number of audit rows pruned by this retention sweep.', example: 128 }),
    retentionDays: z.number().meta({
      description: 'Retention window in days; rows older than this were deleted.',
      example: 90,
    }),
  })
  .meta({ id: 'AuditDetailAuditRetentionPrune' })

// Platform logos. The fetch itself is a background job, so `logo_fetch.finish`
// is written by the worker with userId 'system' — same convention as
// audit.retention.prune.
const LogoFetchStart = z
  .object({
    action: z.literal('logo_fetch.start').meta({
      description: 'Action code identifying this audit variant.',
      example: 'logo_fetch.start',
    }),
    jobId: z
      .string()
      .meta({ description: 'Identifier of the queued logo-fetch job.', example: 'lfj_01HQ8ZK' }),
    force: z.boolean().meta({
      description: 'True when the job refetches logos that are already stored.',
      example: false,
    }),
    vertical: z.string().nullable().meta({
      description: 'Vertical the fetch was limited to, or null for every vertical.',
      example: 'accounting',
    }),
    slug: z.string().nullable().meta({
      description: 'Single platform the fetch was limited to, or null for all of them.',
      example: 'xero',
    }),
    total: z
      .number()
      .meta({ description: 'Number of platforms the job will consider.', example: 1545 }),
  })
  .meta({ id: 'AuditDetailLogoFetchStart' })

const LogoFetchCancel = z
  .object({
    action: z.literal('logo_fetch.cancel').meta({
      description: 'Action code identifying this audit variant.',
      example: 'logo_fetch.cancel',
    }),
    jobId: z
      .string()
      .meta({ description: 'Identifier of the cancelled logo-fetch job.', example: 'lfj_01HQ8ZK' }),
    processed: z
      .number()
      .meta({ description: 'Platforms processed before the cancel was requested.', example: 412 }),
  })
  .meta({ id: 'AuditDetailLogoFetchCancel' })

const LogoFetchFinish = z
  .object({
    action: z.literal('logo_fetch.finish').meta({
      description: 'Action code identifying this audit variant.',
      example: 'logo_fetch.finish',
    }),
    jobId: z
      .string()
      .meta({ description: 'Identifier of the finished logo-fetch job.', example: 'lfj_01HQ8ZK' }),
    status: z.string().meta({
      description: 'Terminal status: completed, failed, or cancelled.',
      example: 'completed',
    }),
    fetched: z.number().meta({ description: 'Logos downloaded and stored.', example: 1402 }),
    skipped: z
      .number()
      .meta({ description: 'Platforms skipped because a logo was already stored.', example: 71 }),
    notFound: z
      .number()
      .meta({ description: 'Platforms Brandfetch has no logo for.', example: 70 }),
    throttled: z
      .number()
      .meta({ description: 'Platforms abandoned to Brandfetch rate limiting.', example: 2 }),
    durationMs: z
      .number()
      .meta({ description: 'Wall-clock duration of the job in milliseconds.', example: 2410000 }),
  })
  .meta({ id: 'AuditDetailLogoFetchFinish' })

const LogoFetchPurge = z
  .object({
    action: z.literal('logo_fetch.purge').meta({
      description: 'Action code identifying this audit variant.',
      example: 'logo_fetch.purge',
    }),
    deleted: z.number().meta({ description: 'Number of stored logo rows deleted.', example: 1402 }),
  })
  .meta({ id: 'AuditDetailLogoFetchPurge' })

// Tenant registry + custom-domain management (operator-only).
const TenantCreate = z
  .object({
    action: z.literal('tenant.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'tenant.create',
    }),
    name: z
      .string()
      .meta({ description: 'Name of the created tenant.', example: 'Acme Industries' }),
  })
  .meta({ id: 'AuditDetailTenantCreate' })

const TenantUpdate = z
  .object({
    action: z.literal('tenant.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'tenant.update',
    }),
    name: z.string().meta({ description: 'New name of the tenant.', example: 'Acme Industries' }),
  })
  .meta({ id: 'AuditDetailTenantUpdate' })

const TenantDelete = z
  .object({
    action: z.literal('tenant.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'tenant.delete',
    }),
  })
  .meta({ id: 'AuditDetailTenantDelete' })

const TenantDomainAdd = z
  .object({
    action: z.literal('tenant_domain.add').meta({
      description: 'Action code identifying this audit variant.',
      example: 'tenant_domain.add',
    }),
    domain: z
      .string()
      .meta({ description: 'Custom domain attached to the tenant.', example: 'dept-a.acme.com' }),
  })
  .meta({ id: 'AuditDetailTenantDomainAdd' })

const TenantDomainRemove = z
  .object({
    action: z.literal('tenant_domain.remove').meta({
      description: 'Action code identifying this audit variant.',
      example: 'tenant_domain.remove',
    }),
    domain: z
      .string()
      .meta({ description: 'Custom domain detached from the tenant.', example: 'dept-a.acme.com' }),
  })
  .meta({ id: 'AuditDetailTenantDomainRemove' })

// Dashboard "Needs attention" clears (operator-only). See routes/dashboard-tasks.ts.
const DashboardTaskDismiss = z
  .object({
    action: z.literal('dashboard_task.dismiss').meta({
      description: 'Action code identifying this audit variant.',
      example: 'dashboard_task.dismiss',
    }),
    keys: z.array(z.string()).meta({
      description: 'Task keys that were cleared.',
      example: ['conn:expired:conn_1042', 'sync:failed:job_7'],
    }),
    count: z.number().int().meta({ description: 'How many tasks were cleared.', example: 2 }),
  })
  .meta({
    id: 'AuditDetailDashboardTaskDismiss',
    description: 'Audit detail for clearing tasks on the dashboard.',
  })

const DashboardTaskUndismiss = z
  .object({
    action: z.literal('dashboard_task.undismiss').meta({
      description: 'Action code identifying this audit variant.',
      example: 'dashboard_task.undismiss',
    }),
  })
  .meta({ id: 'AuditDetailDashboardTaskUndismiss' })

// ── Roles, permissions and scope ──────────────────────────────────────────
//
// `role.create`/`role.update` reuse the `{ name }` shape and the IdP
// scope-rule actions the `{ providerId }` shape, so they publish into the
// existing shared components rather than adding one each.

const RoleCreate = z
  .object({
    action: z.literal('role.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'role.create',
    }),
    name: z.string().meta({ description: 'Name of the created role.', example: 'Support lead' }),
  })
  .meta({ id: 'AuditDetailRoleCreate' })

const RoleUpdate = z
  .object({
    action: z.literal('role.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'role.update',
    }),
    name: z.string().meta({ description: 'Name of the role after the update.', example: 'Support lead' }),
  })
  .meta({ id: 'AuditDetailRoleUpdate' })

const RoleDelete = z
  .object({
    action: z.literal('role.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'role.delete',
    }),
  })
  .meta({ id: 'AuditDetailRoleDelete' })

const UserRoleAssign = z
  .object({
    action: z.literal('user.role_assign').meta({
      description: 'Action code identifying this audit variant.',
      example: 'user.role_assign',
    }),
    roleId: z.string().meta({
      description: 'Role assigned: a built-in id (`admin`, `operator`, `viewer`) or a custom role id.',
      example: 'operator',
    }),
    baseRole: RoleEnum.meta({
      description: 'Base role the user now holds for role-level gates.',
      example: 'operator',
    }),
    scopeCleared: z.boolean().optional().meta({
      description: 'True when the change made the user an admin and so lifted their tenant restriction.',
      example: true,
    }),
  })
  .meta({ id: 'AuditDetailUserRoleAssign' })

const ScopeMode = z.enum(['all', 'restricted'])

const UserScopeUpdate = z
  .object({
    action: z.literal('user.scope_update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'user.scope_update',
    }),
    mode: ScopeMode.meta({
      description: '`all` (every tenant) or `restricted` to the listed tenants.',
      example: 'restricted',
    }),
    tenantIds: z.array(z.string()).meta({
      description: 'Tenants granted; empty when `mode` is `all`.',
      example: ['acme'],
    }),
  })
  .meta({ id: 'AuditDetailUserScopeUpdate' })

const IdpScopeRuleCreate = z
  .object({
    action: z.literal('idp.scope_rule.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'idp.scope_rule.create',
    }),
    providerId: z.string().meta({
      description: 'Identity provider the scope rule belongs to (prefix `idp_`).',
      example: 'idp_northwind',
    }),
  })
  .meta({ id: 'AuditDetailIdpScopeRuleCreate' })

const IdpScopeRuleDelete = z
  .object({
    action: z.literal('idp.scope_rule.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'idp.scope_rule.delete',
    }),
    providerId: z.string().meta({
      description: 'Identity provider the scope rule belongs to (prefix `idp_`).',
      example: 'idp_northwind',
    }),
  })
  .meta({ id: 'AuditDetailIdpScopeRuleDelete' })

const IdpDefaultScopeUpdate = z
  .object({
    action: z.literal('idp.default_scope.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'idp.default_scope.update',
    }),
    mode: ScopeMode.meta({
      description: '`all` (every tenant) or `restricted` to the listed tenants.',
      example: 'restricted',
    }),
    tenantIds: z.array(z.string()).meta({
      description: 'Tenants granted; empty when `mode` is `all`.',
      example: ['acme'],
    }),
  })
  .meta({ id: 'AuditDetailIdpDefaultScopeUpdate' })

// ── Data access and dashboards ────────────────────────────────────────────

const DataPiiReveal = z
  .object({
    action: z.literal('data.pii_reveal').meta({
      description: 'Action code identifying this audit variant.',
      example: 'data.pii_reveal',
    }),
    connectionId: z.string().meta({
      description: 'Connection whose stored record was revealed.',
      example: '9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    }),
    resourceType: z.string().meta({
      description: 'Resource type of the record, as stored by the sync worker.',
      example: 'contacts',
    }),
    resourceId: z.string().meta({
      description: 'Id of the record whose personal data was shown unmasked.',
      example: 'cont_jane',
    }),
    reason: z.string().nullable().meta({
      description: 'Why the operator needed the unmasked record, as they typed it; null when none was given.',
      example: 'Support ticket #4821',
    }),
  })
  .meta({
    id: 'AuditDetailDataPiiReveal',
    description: 'Audit detail for revealing the personal data in one stored record.',
  })

const DataExport = z
  .object({
    action: z.literal('data.export').meta({
      description: 'Action code identifying this audit variant.',
      example: 'data.export',
    }),
    connectionId: z.string().meta({
      description: 'Connection whose stored records were exported.',
      example: '9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    }),
    resourceType: z.string().meta({
      description: 'Resource type exported.',
      example: 'orders',
    }),
    format: z.enum(['csv', 'ndjson']).meta({
      description: 'Export format: `csv` or `ndjson`.',
      example: 'csv',
    }),
    includePii: z.boolean().meta({
      description: 'True when the export carried unmasked personal data.',
      example: false,
    }),
  })
  .meta({
    id: 'AuditDetailDataExport',
    description: 'Audit detail for an export of stored records.',
  })

const DashboardCreate = z
  .object({
    action: z.literal('dashboard.create').meta({
      description: 'Action code identifying this audit variant.',
      example: 'dashboard.create',
    }),
    name: z.string().meta({ description: 'Name of the dashboard.', example: 'Weekly revenue' }),
  })
  .meta({ id: 'AuditDetailDashboardCreate' })

const DashboardUpdate = z
  .object({
    action: z.literal('dashboard.update').meta({
      description: 'Action code identifying this audit variant.',
      example: 'dashboard.update',
    }),
    name: z.string().meta({ description: 'Name of the dashboard after the update.', example: 'Weekly revenue' }),
  })
  .meta({ id: 'AuditDetailDashboardUpdate' })

const DashboardDelete = z
  .object({
    action: z.literal('dashboard.delete').meta({
      description: 'Action code identifying this audit variant.',
      example: 'dashboard.delete',
    }),
    name: z.string().meta({ description: 'Name of the deleted dashboard.', example: 'Weekly revenue' }),
  })
  .meta({ id: 'AuditDetailDashboardDelete' })

const AuditAudience = z
  .object({
    kind: z
      .enum(['private', 'tenants', 'everyone'])
      .meta({ description: 'Audience kind.', example: 'tenants' }),
    tenants: z
      .array(z.string())
      .optional()
      .meta({ description: 'Tenant ids, for `tenants`.', example: ['acme'] }),
  })
  .meta({ id: 'AuditDashboardAudience', description: 'Who a dashboard is shared with.' })

const DashboardShare = z
  .object({
    action: z.literal('dashboard.share').meta({
      description: 'Action code identifying this audit variant.',
      example: 'dashboard.share',
    }),
    name: z.string().meta({ description: 'Name of the dashboard.', example: 'Weekly revenue' }),
    from: AuditAudience,
    to: AuditAudience,
    pinnedFrom: z
      .array(z.string())
      .nullable()
      .meta({ description: 'Pinned tenants before.', example: null }),
    pinnedTo: z
      .array(z.string())
      .nullable()
      .meta({ description: 'Pinned tenants after.', example: ['acme'] }),
  })
  .meta({ id: 'AuditDetailDashboardShare' })

// ── Embedded Superset ─────────────────────────────────────────────────────

const SupersetGuestToken = z
  .object({
    action: z.literal('superset.guest_token').meta({
      description: 'Action code identifying this audit variant.',
      example: 'superset.guest_token',
    }),
    title: z.string().meta({
      description: 'Title of the embedded Superset dashboard.',
      example: 'Connection data overview',
    }),
    restricted: z.boolean().meta({
      description:
        'True when the token carried a tenant row-level-security clause. Recorded at most once per user and dashboard every 10 minutes.',
      example: false,
    }),
  })
  .meta({
    id: 'AuditDetailSupersetGuestToken',
    description: 'Audit detail for a guest token minted to embed a Superset dashboard.',
  })

const SupersetRegistrySync = z
  .object({
    action: z.literal('superset.registry_sync').meta({
      description: 'Action code identifying this audit variant.',
      example: 'superset.registry_sync',
    }),
    created: z.number().meta({ description: 'Dashboards added to the registry.', example: 1 }),
    updated: z.number().meta({ description: 'Dashboards updated in place.', example: 0 }),
    removed: z.number().meta({ description: 'Dashboards removed (prune).', example: 0 }),
  })
  .meta({
    id: 'AuditDetailSupersetRegistrySync',
    description: 'Audit detail for the superset-bootstrap job syncing the dashboard registry.',
  })

const SupersetShare = z
  .object({
    action: z.literal('superset.share').meta({
      description: 'Action code identifying this audit variant.',
      example: 'superset.share',
    }),
    title: z.string().meta({ description: 'Title of the Superset dashboard.', example: 'Revenue' }),
    from: AuditAudience,
    to: AuditAudience,
    pinnedFrom: z
      .array(z.string())
      .nullable()
      .meta({ description: 'Pinned tenants before.', example: null }),
    pinnedTo: z
      .array(z.string())
      .nullable()
      .meta({ description: 'Pinned tenants after.', example: ['acme'] }),
  })
  .meta({ id: 'AuditDetailSupersetShare' })

// ── Destinations and read-only SQL access ────────────────────────────────
// No secret ever reaches these details: destination credentials are named
// (`secretFields`), never valued, and SQL passwords are not recorded at all.

const act = (literal: string) =>
  ({ description: 'Action code identifying this audit variant.', example: literal }) as const

const DestinationId = z.string().meta({
  description: 'Id of the destination.',
  example: '5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b',
})

const DestinationCreate = z
  .object({
    action: z.literal('destination.create').meta(act('destination.create')),
    destinationId: DestinationId,
    name: z.string().meta({ description: 'Name of the destination.', example: 'Lake (prod)' }),
    type: z.string().meta({ description: 'Destination type.', example: 's3' }),
    includePii: z.boolean().meta({
      description: 'True when the destination exports personal data unmasked.',
      example: false,
    }),
    tenants: z.union([z.literal('*'), z.array(z.string())]).meta({
      description: 'Owner tenants the destination exports, or `*` for every tenant.',
      example: ['acme'],
    }),
  })
  .meta({ id: 'AuditDetailDestinationCreate', description: 'Audit detail for creating a destination.' })

const DestinationUpdate = z
  .object({
    action: z.literal('destination.update').meta(act('destination.update')),
    destinationId: DestinationId,
    name: z.string().meta({ description: 'Name after the update.', example: 'Lake (prod)' }),
    fields: z.array(z.string()).meta({
      description: 'Settings the update changed (`name`, `config`, `scope`, `includePii`, `intervalSec`, `enabled`).',
      example: ['config', 'intervalSec'],
    }),
    includePii: z.boolean().meta({
      description: 'Whether the destination exports personal data unmasked after the update.',
      example: false,
    }),
  })
  .meta({ id: 'AuditDetailDestinationUpdate', description: 'Audit detail for changing a destination.' })

const DestinationDelete = z
  .object({
    action: z.literal('destination.delete').meta(act('destination.delete')),
    destinationId: DestinationId,
    name: z.string().nullable().meta({
      description: 'Name of the deleted destination; null when it could not be read first.',
      example: 'Lake (prod)',
    }),
  })
  .meta({ id: 'AuditDetailDestinationDelete', description: 'Audit detail for deleting a destination.' })

const DestinationRun = z
  .object({
    action: z.literal('destination.run').meta(act('destination.run')),
    destinationId: DestinationId,
    runId: z.string().meta({
      description: 'Id of the run that was started.',
      example: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    }),
  })
  .meta({ id: 'AuditDetailDestinationRun', description: 'Audit detail for starting a destination run by hand.' })

const DestinationBackfill = z
  .object({
    action: z.literal('destination.backfill').meta(act('destination.backfill')),
    destinationId: DestinationId,
    vertical: z.string().nullable().meta({
      description: 'Vertical whose cursors were reset; null for every vertical.',
      example: 'crm',
    }),
    resourceType: z.string().nullable().meta({
      description: 'Resource type whose cursor was reset; null for every type.',
      example: 'contacts',
    }),
    cursorsReset: z.number().meta({ description: 'Cursors reset.', example: 3 }),
    runId: z.string().nullable().meta({
      description: 'Run started right away; null when none was started.',
      example: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    }),
  })
  .meta({ id: 'AuditDetailDestinationBackfill', description: 'Audit detail for a destination backfill.' })

const DestinationCredentialsRotate = z
  .object({
    action: z.literal('destination.credentials_rotate').meta(act('destination.credentials_rotate')),
    destinationId: DestinationId,
    secretFields: z.array(z.string()).meta({
      description: 'Names of the credential fields now set. Values are never recorded.',
      example: ['accessKeyId', 'secretAccessKey'],
    }),
  })
  .meta({
    id: 'AuditDetailDestinationCredentialsRotate',
    description: "Audit detail for replacing a destination's credentials.",
  })

const DestinationTest = z
  .object({
    action: z.literal('destination.test').meta(act('destination.test')),
    destinationId: DestinationId,
    ok: z.boolean().meta({ description: 'Whether the connection test passed.', example: true }),
  })
  .meta({ id: 'AuditDetailDestinationTest', description: 'Audit detail for testing a destination.' })

const SqlPrincipalId = z.string().meta({
  description: 'Id of the SQL principal.',
  example: '3f9a1c2b-4d5e-4f60-8a7b-1c2d3e4f5a6b',
})
const SqlUsername = z.string().meta({
  description: 'Postgres login name of the principal.',
  example: 'os_sql_metabase_prod_3f9a1c',
})

const SqlAccessProvision = z
  .object({
    action: z.literal('sql_access.provision').meta(act('sql_access.provision')),
    changed: z.boolean().meta({ description: 'Whether anything was (re)created.', example: true }),
    version: z.number().nullable().meta({ description: 'Catalog version now deployed.', example: 1 }),
    breaking: z.boolean().meta({
      description: 'True when a new catalog version was cut for a breaking change.',
      example: false,
    }),
  })
  .meta({ id: 'AuditDetailSqlAccessProvision', description: 'Audit detail for provisioning the SQL views.' })

const SqlAccessPrincipalCreate = z
  .object({
    action: z.literal('sql_access.principal_create').meta(act('sql_access.principal_create')),
    principalId: SqlPrincipalId,
    username: SqlUsername,
    label: z.string().meta({ description: 'Label of the principal.', example: 'Metabase prod' }),
    pii: z.boolean().meta({ description: 'True for an unmasked (PII) principal.', example: false }),
    tenants: z.union([z.literal('*'), z.array(z.string())]).meta({
      description: 'Tenants the principal sees, or `*`.',
      example: ['acme'],
    }),
    verticals: z.union([z.literal('*'), z.array(z.string())]).nullable().meta({
      description: 'Verticals the principal sees; `*` or null for all.',
      example: ['crm'],
    }),
    expiresAt: z.string().nullable().meta({
      description: 'When the login expires (ISO 8601); null for never.',
      example: '2027-01-01T00:00:00.000Z',
    }),
  })
  .meta({
    id: 'AuditDetailSqlAccessPrincipalCreate',
    description: 'Audit detail for creating a read-only SQL principal. The password is never recorded.',
  })

const SqlAccessPrincipalRotate = z
  .object({
    action: z.literal('sql_access.principal_rotate').meta(act('sql_access.principal_rotate')),
    principalId: SqlPrincipalId,
    username: SqlUsername,
    sessionsTerminated: z.number().nullable().meta({
      description: 'Open sessions ended; null when unknown (manual mode).',
      example: 1,
    }),
  })
  .meta({
    id: 'AuditDetailSqlAccessPrincipalRotate',
    description: "Audit detail for rotating a SQL principal's password. The password is never recorded.",
  })

const SqlAccessPrincipalRevoke = z
  .object({
    action: z.literal('sql_access.principal_revoke').meta(act('sql_access.principal_revoke')),
    principalId: SqlPrincipalId,
    username: SqlUsername,
    sessionsTerminated: z.number().nullable().meta({
      description: 'Open sessions ended; null when unknown (manual mode).',
      example: 1,
    }),
  })
  .meta({ id: 'AuditDetailSqlAccessPrincipalRevoke', description: 'Audit detail for revoking a SQL principal.' })

// ── Union ─────────────────────────────────────────────────────────────────

/**
 * Every known `(action, detail-fields)` variant. Adding a new variant
 * here is the only way for `writeAudit` to accept a new action — the
 * parameter type is derived from this union, so a missing branch fails
 * to compile at the call site.
 *
 * The OpenAPI `discriminator` is set to `action` so Swagger UI picks
 * the correct branch based on the `action` value of the entry.
 */
export const AuditDetailUnion = z
  .discriminatedUnion('action', [
    SchemaMigrate,
    UserCreate,
    UserUpdate,
    UserDelete,
    UserLogin,
    UserLockoutTemporary,
    UserLockoutPermanent,
    SsoLogin,
    SsoProviderCreate,
    SsoProviderUpdate,
    SsoProviderDelete,
    SsoRoleMappingCreate,
    SsoRoleMappingDelete,
    SsoScimTokenMint,
    SsoScimTokenRevoke,
    SsoScimProvision,
    SsoScimDeprovision,
    SsoScimGroupCreate,
    SsoScimGroupUpdate,
    SsoScimGroupDelete,
    ConnectLinkTemplateCreate,
    ConnectLinkTemplateUpdate,
    ConnectLinkTemplateDelete,
    ConnectSessionCreate,
    ConnectSessionRevoke,
    ConnectionCreate,
    ConnectionDelete,
    ConnectionUpdate,
    ConnectionSyncSchedule,
    OAuthIssuerCreate,
    OAuthIssuerUpdate,
    OAuthIssuerDelete,
    OAuthClientCreate,
    OAuthClientRevoke,
    ApiKeyMint,
    ApiKeyRevoke,
    ApiKeyRotate,
    EndUserCreate,
    EndUserUpdate,
    EndUserDelete,
    UserPiiReveal,
    UserAvatarUpdate,
    UserAvatarDelete,
    EndUserPiiReveal,
    EndUserTokenMint,
    EndUserTokenRevoke,
    WebhookSubCreate,
    WebhookSubDelete,
    WebhookSubPause,
    WebhookSubRotateSecret,
    WebhookSubUpdate,
    WebhookSubTest,
    WebhookDeliveryReplay,
    SyncJobCreate,
    SyncJobCancel,
    CompanyInfoUpdate,
    CompanyInfoReset,
    RuntimeSettingUpdate,
    RuntimeSettingReset,
    AdapterEnable,
    AdapterDisable,
    AdapterConfig,
    ScopeGroupCreate,
    ScopeGroupUpdate,
    ScopeGroupDelete,
    AuditExport,
    AuditRetentionPrune,
    LogoFetchStart,
    LogoFetchCancel,
    LogoFetchFinish,
    LogoFetchPurge,
    TenantCreate,
    TenantUpdate,
    TenantDelete,
    TenantDomainAdd,
    TenantDomainRemove,
    DashboardTaskDismiss,
    DashboardTaskUndismiss,
    RoleCreate,
    RoleUpdate,
    RoleDelete,
    UserRoleAssign,
    UserScopeUpdate,
    IdpScopeRuleCreate,
    IdpScopeRuleDelete,
    IdpDefaultScopeUpdate,
    DataPiiReveal,
    DataExport,
    DashboardCreate,
    DashboardUpdate,
    DashboardDelete,
    DashboardShare,
    SupersetGuestToken,
    SupersetRegistrySync,
    SupersetShare,
    DestinationCreate,
    DestinationUpdate,
    DestinationDelete,
    DestinationRun,
    DestinationBackfill,
    DestinationCredentialsRotate,
    DestinationTest,
    SqlAccessProvision,
    SqlAccessPrincipalCreate,
    SqlAccessPrincipalRotate,
    SqlAccessPrincipalRevoke,
  ])
  .meta({
    // Not the component the spec publishes: `AuditDetailDoc` below owns the
    // `AuditDetail` id and is what `AuditEntry.detail` references. This id
    // exists so the writer union stays a named, distinct schema.
    id: 'AuditDetailByAction',
    description:
      'Per-action audit-log detail, keyed by `action`. The discriminator field lives inside each variant so Swagger UI renders the right branch when an entry is expanded.',
    // Both `propertyName` AND `mapping` are required for downstream
    // consumers — Swagger UI is fine with just the property name, but
    // `openapi-typescript` (used to regenerate the SDK) falls back to the
    // component name as the discriminator value when no mapping is set,
    // which produces wrong types like `action: 'AuditDetailUserCreate'`
    // instead of `action: 'user.create'`. The mapping pins each literal
    // back to its component schema so the SDK types match the wire shape.
    override: ({ jsonSchema }) => {
      jsonSchema.discriminator = {
        propertyName: 'action',
        mapping: {
          'schema.migrate': '#/components/schemas/AuditDetailSchemaMigrate',
          'user.create': '#/components/schemas/AuditDetailUserCreate',
          'user.update': '#/components/schemas/AuditDetailUserUpdate',
          'user.delete': '#/components/schemas/AuditDetailUserDelete',
          'user.login': '#/components/schemas/AuditDetailUserLogin',
          'user.lockout.temporary': '#/components/schemas/AuditDetailUserLockoutTemporary',
          'user.lockout.permanent': '#/components/schemas/AuditDetailUserLockoutPermanent',
          'sso.login': '#/components/schemas/AuditDetailSsoLogin',
          'sso.provider.create': '#/components/schemas/AuditDetailSsoProviderCreate',
          'sso.provider.update': '#/components/schemas/AuditDetailSsoProviderUpdate',
          'sso.provider.delete': '#/components/schemas/AuditDetailSsoProviderDelete',
          'sso.role_mapping.create': '#/components/schemas/AuditDetailSsoRoleMappingCreate',
          'sso.role_mapping.delete': '#/components/schemas/AuditDetailSsoRoleMappingDelete',
          'sso.scim_token.mint': '#/components/schemas/AuditDetailSsoScimTokenMint',
          'sso.scim_token.revoke': '#/components/schemas/AuditDetailSsoScimTokenRevoke',
          'sso.scim.provision': '#/components/schemas/AuditDetailSsoScimProvision',
          'sso.scim.deprovision': '#/components/schemas/AuditDetailSsoScimDeprovision',
          'sso.scim.group.create': '#/components/schemas/AuditDetailSsoScimGroupCreate',
          'sso.scim.group.update': '#/components/schemas/AuditDetailSsoScimGroupUpdate',
          'sso.scim.group.delete': '#/components/schemas/AuditDetailSsoScimGroupDelete',
          'connect_link_template.create':
            '#/components/schemas/AuditDetailConnectLinkTemplateCreate',
          'connect_link_template.update':
            '#/components/schemas/AuditDetailConnectLinkTemplateUpdate',
          'connect_link_template.delete':
            '#/components/schemas/AuditDetailConnectLinkTemplateDelete',
          'connect_session.create': '#/components/schemas/AuditDetailConnectSessionCreate',
          'connect_session.revoke': '#/components/schemas/AuditDetailConnectSessionRevoke',
          'connection.create': '#/components/schemas/AuditDetailConnectionCreate',
          'connection.delete': '#/components/schemas/AuditDetailConnectionDelete',
          'connection.update': '#/components/schemas/AuditDetailConnectionUpdate',
          'connection.sync_schedule': '#/components/schemas/AuditDetailConnectionSyncSchedule',
          'api_key.mint': '#/components/schemas/AuditDetailApiKeyMint',
          'api_key.revoke': '#/components/schemas/AuditDetailApiKeyRevoke',
          'api_key.rotate': '#/components/schemas/AuditDetailApiKeyRotate',
          'end_user.create': '#/components/schemas/AuditDetailEndUserCreate',
          'end_user.update': '#/components/schemas/AuditDetailEndUserUpdate',
          'end_user.delete': '#/components/schemas/AuditDetailEndUserDelete',
          'user.pii_reveal': '#/components/schemas/AuditDetailUserPiiReveal',
          'user.avatar_update': '#/components/schemas/AuditDetailUserAvatarUpdate',
          'user.avatar_delete': '#/components/schemas/AuditDetailUserAvatarDelete',
          'end_user.pii_reveal': '#/components/schemas/AuditDetailEndUserPiiReveal',
          'end_user_token.mint': '#/components/schemas/AuditDetailEndUserTokenMint',
          'end_user_token.revoke': '#/components/schemas/AuditDetailEndUserTokenRevoke',
          'webhook_sub.create': '#/components/schemas/AuditDetailWebhookSubCreate',
          'webhook_sub.delete': '#/components/schemas/AuditDetailWebhookSubDelete',
          'webhook_sub.pause': '#/components/schemas/AuditDetailWebhookSubPause',
          'webhook_sub.rotate_secret': '#/components/schemas/AuditDetailWebhookSubRotateSecret',
          'webhook_sub.update': '#/components/schemas/AuditDetailWebhookSubUpdate',
          'webhook_sub.test': '#/components/schemas/AuditDetailWebhookSubTest',
          'webhook_delivery.replay': '#/components/schemas/AuditDetailWebhookDeliveryReplay',
          'sync_job.create': '#/components/schemas/AuditDetailSyncJobCreate',
          'sync_job.cancel': '#/components/schemas/AuditDetailSyncJobCancel',
          'company_info.update': '#/components/schemas/AuditDetailCompanyInfoUpdate',
          'company_info.reset': '#/components/schemas/AuditDetailCompanyInfoReset',
          'runtime_setting.update': '#/components/schemas/AuditDetailRuntimeSettingUpdate',
          'runtime_setting.reset': '#/components/schemas/AuditDetailRuntimeSettingReset',
          'adapter.enable': '#/components/schemas/AuditDetailAdapterEnable',
          'adapter.disable': '#/components/schemas/AuditDetailAdapterDisable',
          'adapter.config': '#/components/schemas/AuditDetailAdapterConfig',
          'scope_group.create': '#/components/schemas/AuditDetailScopeGroupCreate',
          'scope_group.update': '#/components/schemas/AuditDetailScopeGroupUpdate',
          'scope_group.delete': '#/components/schemas/AuditDetailScopeGroupDelete',
          'audit.export': '#/components/schemas/AuditDetailAuditExport',
          'audit.retention.prune': '#/components/schemas/AuditDetailAuditRetentionPrune',
          'logo_fetch.start': '#/components/schemas/AuditDetailLogoFetchStart',
          'logo_fetch.cancel': '#/components/schemas/AuditDetailLogoFetchCancel',
          'logo_fetch.finish': '#/components/schemas/AuditDetailLogoFetchFinish',
          'logo_fetch.purge': '#/components/schemas/AuditDetailLogoFetchPurge',
          'tenant.create': '#/components/schemas/AuditDetailTenantCreate',
          'tenant.update': '#/components/schemas/AuditDetailTenantUpdate',
          'tenant.delete': '#/components/schemas/AuditDetailTenantDelete',
          'tenant_domain.add': '#/components/schemas/AuditDetailTenantDomainAdd',
          'tenant_domain.remove': '#/components/schemas/AuditDetailTenantDomainRemove',
          'dashboard_task.dismiss': '#/components/schemas/AuditDetailDashboardTaskDismiss',
          'dashboard_task.undismiss': '#/components/schemas/AuditDetailDashboardTaskUndismiss',
          'role.create': '#/components/schemas/AuditDetailRoleCreate',
          'role.update': '#/components/schemas/AuditDetailRoleUpdate',
          'role.delete': '#/components/schemas/AuditDetailRoleDelete',
          'user.role_assign': '#/components/schemas/AuditDetailUserRoleAssign',
          'user.scope_update': '#/components/schemas/AuditDetailUserScopeUpdate',
          'idp.scope_rule.create': '#/components/schemas/AuditDetailIdpScopeRuleCreate',
          'idp.scope_rule.delete': '#/components/schemas/AuditDetailIdpScopeRuleDelete',
          'idp.default_scope.update': '#/components/schemas/AuditDetailIdpDefaultScopeUpdate',
          'data.pii_reveal': '#/components/schemas/AuditDetailDataPiiReveal',
          'data.export': '#/components/schemas/AuditDetailDataExport',
          'dashboard.create': '#/components/schemas/AuditDetailDashboardCreate',
          'dashboard.update': '#/components/schemas/AuditDetailDashboardUpdate',
          'dashboard.delete': '#/components/schemas/AuditDetailDashboardDelete',
          'dashboard.share': '#/components/schemas/AuditDetailDashboardShare',
          'superset.guest_token': '#/components/schemas/AuditDetailSupersetGuestToken',
          'superset.registry_sync': '#/components/schemas/AuditDetailSupersetRegistrySync',
          'superset.share': '#/components/schemas/AuditDetailSupersetShare',
          'destination.create': '#/components/schemas/AuditDetailDestinationCreate',
          'destination.update': '#/components/schemas/AuditDetailDestinationUpdate',
          'destination.delete': '#/components/schemas/AuditDetailDestinationDelete',
          'destination.run': '#/components/schemas/AuditDetailDestinationRun',
          'destination.backfill': '#/components/schemas/AuditDetailDestinationBackfill',
          'destination.credentials_rotate':
            '#/components/schemas/AuditDetailDestinationCredentialsRotate',
          'destination.test': '#/components/schemas/AuditDetailDestinationTest',
          'sql_access.provision': '#/components/schemas/AuditDetailSqlAccessProvision',
          'sql_access.principal_create': '#/components/schemas/AuditDetailSqlAccessPrincipalCreate',
          'sql_access.principal_rotate': '#/components/schemas/AuditDetailSqlAccessPrincipalRotate',
          'sql_access.principal_revoke': '#/components/schemas/AuditDetailSqlAccessPrincipalRevoke',
        },
      }
    },
  })

/** Full variant shape — includes the `action` literal. */
export type AuditDetail = z.infer<typeof AuditDetailUnion>

/** All known literal action strings. */
export type AuditAction = AuditDetail['action']

/**
 * Every registered action literal, in union order — the source for filter
 * dropdowns. Derived from the schema options so a new variant appears here
 * the moment it exists, never by hand-copying.
 */
export const AUDIT_ACTION_VALUES: readonly string[] = AuditDetailUnion.options.map(
  (option) => option.shape.action.value as string,
)

/**
 * The per-action payload fields, with the `action` discriminator stripped.
 * This is what `writeAudit({ ... }).detail` accepts — the action literal
 * is supplied via the sibling `action` field, not duplicated in detail.
 */
export type AuditDetailFor<A extends AuditAction> = Omit<
  Extract<AuditDetail, { action: A }>,
  'action'
>

/**
 * Helper: does the variant `A` have any non-`action` payload fields?
 * If not, the `detail` argument is optional at the call site.
 */
type HasPayload<A extends AuditAction> = keyof AuditDetailFor<A> extends never ? false : true

/** Input shape accepted by the object form of `AdminStore.writeAudit`. */
export type WriteAuditInput<A extends AuditAction = AuditAction> = {
  [K in A]: {
    userId: string
    action: K
    vertical?: string | null
    targetId?: string | null
  } & (HasPayload<K> extends true
    ? { detail: AuditDetailFor<K> }
    : { detail?: AuditDetailFor<K> | null })
}[A]

// ── Documentation view: the same union, grouped by shape ─────────────────
//
// `AuditDetailUnion` has one branch per action because that is what types
// the writers: `writeAudit({ action: 'user.lockout.temporary', detail })`
// must fail to compile when `detail` is the wrong shape. Published as-is,
// that was 72 components in the operator spec — 35 of them carrying nothing
// but `action` — and a reader scrolled through pages of near-identical
// schemas to learn a couple of dozen shapes.
//
// So the spec gets this view instead: branches grouped by field shape, each
// with an `action` enum of the actions that share it. It is derived from the
// writer union at module load, so a new action lands in the right group
// with no second registry to maintain, and it accepts exactly what the
// writer union produces — same fields, same types — which is what lets it
// stand in as the response schema for `GET /api/audit`.
//
// Ids: a shape shared by several actions is named after its fields
// (`AuditDetailProviderId`, `AuditDetailActionOnly`); a shape with a single
// action keeps that variant's own id (`AuditDetailSchemaMigrate`), so those
// component names are unchanged.

/** Strip prose from a JSON schema so two fields compare by type alone. */
function withoutProse(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutProse)
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) {
      if (k === 'description' || k === 'example' || k === 'examples' || k === 'title' || k === 'id')
        continue
      out[k] = withoutProse(v)
    }
    return out
  }
  return node
}

function pascal(s: string): string {
  return s.replace(/(^|[._-])(\w)/g, (_m, _sep, c: string) => c.toUpperCase())
}

export interface AuditDetailDocGroup {
  id: string
  actions: string[]
  fields: string[]
}

function buildAuditDetailDoc(): {
  schema: z.ZodDiscriminatedUnion<z.ZodObject[]>
  groups: AuditDetailDocGroup[]
} {
  type Variant = z.ZodObject<Record<string, z.ZodType>>
  const variants = AuditDetailUnion.options as unknown as Variant[]
  const bySignature = new Map<
    string,
    {
      actions: string[]
      fields: Record<string, z.ZodType>
      firstId: string | undefined
      firstDescription: string | undefined
    }
  >()
  for (const variant of variants) {
    const { action, ...fields } = variant.shape
    const actionValue = (action as z.ZodLiteral<string>).value
    const signature = Object.entries(fields)
      .map(
        ([name, field]) =>
          `${name}=${JSON.stringify(withoutProse(z.toJSONSchema(field, { unrepresentable: 'any' })))}`,
      )
      .sort()
      .join('&')
    const existing = bySignature.get(signature)
    if (existing) {
      existing.actions.push(actionValue)
    } else {
      const meta = variant.meta()
      bySignature.set(signature, {
        actions: [actionValue],
        fields,
        firstId: typeof meta?.id === 'string' ? meta.id : undefined,
        firstDescription: typeof meta?.description === 'string' ? meta.description : undefined,
      })
    }
  }

  const groups: AuditDetailDocGroup[] = []
  const branches: z.ZodObject[] = []
  for (const group of bySignature.values()) {
    const fieldNames = Object.keys(group.fields)
    const shared = group.actions.length > 1
    const id = shared
      ? `AuditDetail${fieldNames.length === 0 ? 'ActionOnly' : fieldNames.map(pascal).join('')}`
      : (group.firstId ?? `AuditDetail${pascal(group.actions[0]!)}`)
    const description = shared
      ? `Audit detail shape shared by ${group.actions.length} actions (${group.actions.map((a) => `\`${a}\``).join(', ')})${fieldNames.length === 0 ? ': the action code alone, no further fields' : ''}.`
      : (group.firstDescription ?? `Audit detail for \`${group.actions[0]}\`.`)
    branches.push(
      z
        .object({
          action: z.enum(group.actions as [string, ...string[]]).meta({
            description: shared
              ? `Action code identifying this audit entry. One of: ${group.actions.map((a) => `\`${a}\``).join(', ')}.`
              : 'Action code identifying this audit variant.',
            example: group.actions[0],
          }),
          ...group.fields,
        })
        .meta({ id, description }),
    )
    groups.push({ id, actions: [...group.actions], fields: fieldNames })
  }

  const mapping: Record<string, string> = {}
  for (const g of groups) for (const a of g.actions) mapping[a] = `#/components/schemas/${g.id}`

  const schema = z.discriminatedUnion('action', branches as [z.ZodObject, ...z.ZodObject[]]).meta({
    id: 'AuditDetail',
    description:
      'Per-action audit-log detail, keyed by `action`. Branches are grouped by shape: each lists the actions that share its fields, so an `action` value picks exactly one branch.',
    // Both `propertyName` AND `mapping`, as on the writer union: without
    // the mapping `openapi-typescript` falls back to the component name as
    // the discriminator value and the SDK types come out wrong.
    override: ({ jsonSchema }) => {
      jsonSchema.discriminator = { propertyName: 'action', mapping }
    },
  })
  return { schema, groups }
}

const auditDetailDoc = buildAuditDetailDoc()

/**
 * The shape-grouped view of `AuditDetailUnion`, for the OpenAPI spec and the
 * `GET /api/audit` response schema. Typed as the writer union so the
 * `AuditEntry` schema's inferred type is unchanged; at runtime it validates
 * the same values.
 */
export const AuditDetailDoc = auditDetailDoc.schema as unknown as typeof AuditDetailUnion

/** The groups behind `AuditDetailDoc` — for tests and for anyone asking "which shape is this action?". */
export const AUDIT_DETAIL_DOC_GROUPS: readonly AuditDetailDocGroup[] = auditDetailDoc.groups
