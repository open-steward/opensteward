/**
 * Shared types + Zod config schemas for the identity-provider abstraction.
 *
 * `config_json` on each provider holds NON-secret settings validated by the
 * per-protocol schema below. Secrets (client secret, bind password, SP private
 * key, IdP cert) travel separately and are encrypted at rest (see IdentityStore).
 */
import { z } from 'zod'
import type { Role } from '../../db/identity-store'

/** Normalised identity produced by every protocol after successful auth. */
export interface ResolvedIdentity {
  /** Stable IdP subject: SAML nameID, OIDC sub, LDAP entryUUID/DN. */
  externalId: string
  email: string | null
  /** OIDC `email_verified`, when the IdP sent it; null otherwise (SAML, LDAP).
   *  `false` stops the address being copied onto the console user. */
  emailVerified?: boolean | null
  displayName: string | null
  /** Absolute URL of the user's picture (OIDC `picture`, a SAML picture
   *  attribute), or null. Fetched server-side behind an SSRF guard. */
  pictureUrl?: string | null
  /** All claims/attributes available for role mapping (groups, roles, etc.). */
  attributes: Record<string, unknown>
}

// ── Per-protocol non-secret config ──────────────────────────────────────────

export const OidcConfigSchema = z.object({
  issuer: z.string().url().meta({ description: 'OIDC issuer URL; the discovery document is fetched from `{issuer}/.well-known/openid-configuration`.', example: 'https://idp.northwind.example' }),
  clientId: z.string().min(1).meta({ description: 'OAuth client ID registered with the OIDC provider.', example: 'opensteward' }),
  /** Space-separated scopes; 'openid' is always enforced server-side. */
  scopes: z.string().default('openid profile email').meta({ description: "Space-separated scopes to request; `openid` is always enforced server-side.", example: 'openid profile email' }),
  /** Claim carrying group membership for role mapping (e.g. 'groups'). */
  groupsClaim: z.string().default('groups').meta({ description: 'Name of the claim carrying group membership, used by role-mapping rules.', example: 'groups' }),
  /** Optional OIDC `prompt` value, e.g. 'select_account' or 'login'. Forwarded
   *  on the authorization request when set. */
  prompt: z.string().optional().meta({ description: 'Optional OIDC `prompt` value (e.g. `select_account`, `login`) forwarded on the authorization request.', example: 'select_account' }),
  /** Optional space-separated `acr_values` (authentication context class
   *  references), e.g. an MFA level the IdP should enforce. */
  acrValues: z.string().optional().meta({ description: 'Optional space-separated `acr_values` requesting a specific authentication context (e.g. an MFA level).', example: 'urn:mace:incommon:iap:silver' }),
})
export type OidcConfig = z.infer<typeof OidcConfigSchema>

export const SamlConfigSchema = z.object({
  /** IdP SSO redirect endpoint (where AuthnRequests are sent). */
  entryPoint: z.string().url().meta({ description: 'IdP single sign-on URL where SAML AuthnRequests are sent.', example: 'https://idp.northwind.example/sso' }),
  /** IdP entityID / issuer. */
  idpIssuer: z.string().min(1).meta({ description: "The IdP's entityID/issuer, used to validate the issuer of incoming assertions.", example: 'https://idp.northwind.example/metadata' }),
  /** Our SP entityID (audience the IdP must assert). */
  spEntityId: z.string().min(1).meta({ description: 'Our service-provider entityID; the audience the IdP must assert in the response.', example: 'opensteward' }),
  /** SAML attribute carrying group membership. */
  groupsAttribute: z.string().default('groups').meta({ description: 'SAML attribute carrying group membership, used by role-mapping rules.', example: 'groups' }),
  /** Attribute holding the user's email (falls back to nameID). */
  emailAttribute: z.string().default('email').meta({ description: "SAML attribute holding the user's email; falls back to nameID if absent.", example: 'email' }),
  /** Attribute holding an https URL of the user's picture. Unset: the common
   *  names `picture`, `photo`, `photoUrl` and `avatar` are tried. */
  pictureAttribute: z.string().optional().meta({ description: "SAML attribute holding an https URL of the user's profile picture. When unset, `picture`, `photo`, `photoUrl` and `avatar` are tried. The picture is fetched by admin-api behind an SSRF guard; an uploaded picture is never replaced.", example: 'picture' }),
})
export type SamlConfig = z.infer<typeof SamlConfigSchema>

export const LdapConfigSchema = z.object({
  /** ldaps://host:636 — TLS strongly recommended (required in production). */
  url: z.string().regex(/^ldaps?:\/\//, 'must be an ldap:// or ldaps:// URL').meta({ description: 'LDAP server URL; use `ldaps://` for TLS (required in production).', example: 'ldaps://ldap.northwind.example' }),
  /** Service-account DN used to search for the user. */
  bindDn: z.string().min(1).meta({ description: 'Distinguished name of the service account used to bind and search for users.', example: 'cn=svc,dc=northwind,dc=example' }),
  /** Search base, e.g. ou=people,dc=acme,dc=com. */
  searchBase: z.string().min(1).meta({ description: 'Base DN under which user entries are searched.', example: 'ou=people,dc=northwind,dc=example' }),
  /** Filter with {{username}} placeholder, e.g. (uid={{username}}). */
  searchFilter: z.string().default('(uid={{username}})').meta({ description: 'LDAP search filter with a `{{username}}` placeholder substituted at login time.', example: '(uid={{username}})' }),
  /** Attribute holding group membership (commonly memberOf). */
  groupsAttribute: z.string().default('memberOf').meta({ description: 'Attribute holding group membership (commonly `memberOf`), used by role-mapping rules.', example: 'memberOf' }),
  emailAttribute: z.string().default('mail').meta({ description: "Attribute holding the user's email address.", example: 'mail' }),
  displayNameAttribute: z.string().default('cn').meta({ description: "Attribute holding the user's display name.", example: 'cn' }),
})
export type LdapConfig = z.infer<typeof LdapConfigSchema>

export function validateConfig(
  protocol: 'saml' | 'oidc' | 'ldap',
  config: unknown,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string } {
  const schema =
    protocol === 'oidc' ? OidcConfigSchema : protocol === 'saml' ? SamlConfigSchema : LdapConfigSchema
  const parsed = schema.safeParse(config ?? {})
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: `${first?.path.join('.') || 'config'}: ${first?.message ?? 'invalid'}` }
  }
  return { ok: true, value: parsed.data as Record<string, unknown> }
}

export const ROLES: readonly Role[] = ['admin', 'operator', 'viewer'] as const
export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v)
}
