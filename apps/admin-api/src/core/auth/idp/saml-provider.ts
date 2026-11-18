/**
 * SAML 2.0 provider — SP-initiated redirect, validated assertions via
 * @node-saml/node-saml (signature, audience, recipient, NotOnOrAfter,
 * InResponseTo) plus our own assertion-ID replay table.
 */
import {
  SAML,
  generateServiceProviderMetadata,
  ValidateInResponseTo,
  type CacheProvider,
  type CacheItem,
  type Profile,
} from '@node-saml/node-saml'
import type { IdentityProviderRow, IdentityStore } from '../../db/identity-store'
import { SamlConfigSchema, type ResolvedIdentity, type SamlConfig } from './types'

/** node-saml CacheProvider backed by the IdentityStore so InResponseTo
 *  validation survives the browser redirect. */
function dbCacheProvider(identityStore: IdentityStore): CacheProvider {
  return {
    async saveAsync(key: string, value: string): Promise<CacheItem | null> {
      await identityStore.samlCacheSave(key, value)
      return { value, createdAt: Date.now() }
    },
    async getAsync(key: string): Promise<string | null> {
      return identityStore.samlCacheGet(key)
    },
    async removeAsync(key: string | null): Promise<string | null> {
      if (!key) return null
      await identityStore.samlCacheRemove(key)
      return key
    },
  }
}

/** Optional SP signing material. When `spPrivateKey` is present, AuthnRequests
 *  are signed (RSA-SHA256) so IdPs that require signed requests (Azure AD /
 *  ADFS / strict Okta) accept the flow. Absent → unsigned requests as before. */
export interface SamlSigning {
  spPrivateKey?: string
  spCertificate?: string
}

function buildSaml(
  identityStore: IdentityStore,
  provider: IdentityProviderRow,
  idpCert: string,
  callbackUrl: string,
  signing?: SamlSigning,
): SAML {
  const cfg = SamlConfigSchema.parse(provider.config)
  // Assertions/responses MUST always be signed by the IdP. When an SP private
  // key is configured we additionally sign our AuthnRequests; otherwise this
  // stays a basic SP-initiated flow with unsigned requests.
  return new SAML({
    entryPoint: cfg.entryPoint,
    issuer: cfg.spEntityId,
    callbackUrl,
    idpCert,
    audience: cfg.spEntityId,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    validateInResponseTo: ValidateInResponseTo.ifPresent,
    cacheProvider: dbCacheProvider(identityStore),
    acceptedClockSkewMs: 5000,
    ...(signing?.spPrivateKey
      ? { privateKey: signing.spPrivateKey, signatureAlgorithm: 'sha256' as const }
      : {}),
  })
}

export async function beginSamlLogin(
  identityStore: IdentityStore,
  provider: IdentityProviderRow,
  idpCert: string,
  callbackUrl: string,
  relayState: string,
  signing?: SamlSigning,
): Promise<string> {
  const saml = buildSaml(identityStore, provider, idpCert, callbackUrl, signing)
  return saml.getAuthorizeUrlAsync(relayState, undefined, {})
}

export async function completeSamlLogin(
  identityStore: IdentityStore,
  provider: IdentityProviderRow,
  idpCert: string,
  callbackUrl: string,
  samlResponse: string,
  signing?: SamlSigning,
): Promise<ResolvedIdentity> {
  const saml = buildSaml(identityStore, provider, idpCert, callbackUrl, signing)
  const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse })
  if (!profile) throw new Error('SAML response did not yield a profile')

  // Replay protection: reject a response ID seen within its validity window.
  const replayId = profile.ID ?? profile.sessionIndex ?? `${profile.nameID}:${profile.issuer}`
  if (!(await identityStore.recordSamlAssertion(replayId, Date.now() + 8 * 60 * 60_000))) {
    throw new Error('SAML assertion replay detected')
  }

  return identityFromSamlProfile(profile, SamlConfigSchema.parse(provider.config))
}

/** The Azure AD / ADFS claim URI for an email address. */
const EMAIL_CLAIM_URI = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'

/** Attribute names tried for a picture URL when the provider names none. */
const PICTURE_ATTRIBUTES = ['picture', 'photo', 'photoUrl', 'photoURL', 'avatar'] as const

/** A single string from a SAML attribute value, which may be multi-valued. */
function firstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === 'string' && v.trim())
    return typeof first === 'string' ? first.trim() : null
  }
  return null
}

/**
 * Map a validated SAML profile onto the protocol-neutral identity. The
 * assertion is signed by the IdP, so there is no separate "verified" flag:
 * the email is the configured attribute, then the common names, then a
 * NameID in email format.
 */
export function identityFromSamlProfile(
  profile: Profile,
  cfg: Pick<SamlConfig, 'emailAttribute' | 'groupsAttribute' | 'pictureAttribute'>,
): ResolvedIdentity {
  const attributes = profileToAttributes(profile)
  const email =
    firstString(profile[cfg.emailAttribute]) ||
    firstString(profile.email) ||
    firstString(profile.mail) ||
    firstString(profile[EMAIL_CLAIM_URI]) ||
    (looksLikeEmail(profile.nameID) ? profile.nameID : null) ||
    null
  const pictureNames = cfg.pictureAttribute ? [cfg.pictureAttribute] : PICTURE_ATTRIBUTES
  const pictureUrl = pictureNames.map((name) => firstString(profile[name])).find(Boolean) ?? null

  // Normalise groups to the canonical 'groups' key for role mapping.
  if (cfg.groupsAttribute in attributes && cfg.groupsAttribute !== 'groups') {
    attributes.groups = attributes[cfg.groupsAttribute]
  }

  return {
    externalId: profile.nameID,
    email,
    emailVerified: null,
    displayName:
      (typeof profile['displayName'] === 'string' && (profile['displayName'] as string)) ||
      (typeof profile['cn'] === 'string' && (profile['cn'] as string)) ||
      null,
    pictureUrl,
    attributes,
  }
}

/** SP metadata XML the admin hands to the IdP. When an SP signing key + cert
 *  are configured, the cert is advertised in a signing KeyDescriptor and
 *  AuthnRequestsSigned is set so the IdP knows to verify our signed requests.
 *  (node-saml only emits the signing KeyDescriptor when BOTH are present.) */
export function samlMetadata(
  provider: IdentityProviderRow,
  callbackUrl: string,
  signing?: SamlSigning,
): string {
  const cfg = SamlConfigSchema.parse(provider.config)
  const signsRequests = Boolean(signing?.spPrivateKey && signing?.spCertificate)
  return generateServiceProviderMetadata({
    issuer: cfg.spEntityId,
    callbackUrl,
    wantAssertionsSigned: true,
    ...(signsRequests
      ? { privateKey: signing!.spPrivateKey!, publicCerts: signing!.spCertificate! }
      : {}),
  })
}

function profileToAttributes(profile: Profile): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(profile)) {
    if (typeof v === 'function') continue
    out[k] = v
  }
  return out
}

function looksLikeEmail(v: string | undefined): v is string {
  return typeof v === 'string' && /^[^@\s]+@[^@\s]+$/.test(v)
}
