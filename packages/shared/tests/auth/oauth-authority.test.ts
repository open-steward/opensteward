/**
 * Where a verified token's tenant and scopes come from — the operator's
 * choice, per issuer.
 *
 *   registry   the client row decides; the token's own scope claim is ignored.
 *   intersect  the row is the ceiling and the token may narrow it, never widen.
 *   external   the token decides both, with rails, because nothing can revoke it.
 *
 * These drive `resolveAuthority` with claim bags directly rather than minting
 * tokens — signature verification is already covered in `oidc-verifier.test.ts`
 * and has nothing to say about authority. What is asserted here is the part
 * that decides whose data a caller reaches.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { JWTPayload } from 'jose'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import {
  OAuthClientStore,
  type AuthorityMode,
  type IssuerInput,
  type OAuthIssuerRow,
} from '../../src/auth/oauth-clients'
import { resolveAuthority, mapTokenScopes } from '../../src/auth/oidc-verifier'

let handle: DbHandle
let store: OAuthClientStore

beforeEach(async () => {
  handle = await openDb({ sqlitePath: ':memory:' })
  store = await OAuthClientStore.create(handle)
})

afterEach(async () => {
  await handle?.close()
})

let issuerSeq = 0

async function makeIssuer(over: Partial<IssuerInput> = {}): Promise<OAuthIssuerRow> {
  issuerSeq += 1
  return store.createIssuer({
    name: `IdP ${issuerSeq}`,
    preset: 'generic',
    issuer: `https://idp-${issuerSeq}.example.com/`,
    jwksUri: `https://idp-${issuerSeq}.example.com/jwks`,
    audience: 'https://opensteward.test',
    subjectClaim: 'azp',
    scopeClaim: 'scope',
    ...over,
  })
}

/** A claim bag with a lifetime the rails will accept. */
function claims(over: Record<string, unknown> = {}): JWTPayload {
  const now = Math.floor(Date.now() / 1000)
  return { azp: 'billing-service', iat: now, exp: now + 600, ...over } as JWTPayload
}

const mode = (m: AuthorityMode) => ({ authorityMode: m })

describe('registry mode', () => {
  it('takes tenant and scopes from the row and ignores the token', async () => {
    const issuer = await makeIssuer(mode('registry'))
    await store.createClient({
      issuerId: issuer.id,
      subject: 'billing-service',
      tenantId: 'acme',
      scopes: ['customers:read'],
    })

    // The token asks for everything. In registry mode it does not get a vote.
    const result = await resolveAuthority(issuer, claims({ scope: '* vertical:write' }), store)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.principal.tenantId).toBe('acme')
    expect(result.principal.scopes).toEqual(['customers:read'])
  })

  it('refuses a subject nobody registered', async () => {
    const issuer = await makeIssuer(mode('registry'))
    const result = await resolveAuthority(issuer, claims(), store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unregistered_client')
  })

  it('names the client row as the principal, so rate limits and audit have an id', async () => {
    const issuer = await makeIssuer(mode('registry'))
    const client = await store.createClient({
      issuerId: issuer.id,
      subject: 'billing-service',
      tenantId: 'acme',
      scopes: ['*'],
    })
    const result = await resolveAuthority(issuer, claims(), store)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.principal.principalId).toBe(`oauth_client:${client.id}`)
  })

  it('does not enforce the token lifetime, because revocation is immediate', async () => {
    // A 30-day token is fine here: deleting the row cuts it off today. The
    // lifetime rail is external mode's substitute for that, not a global rule.
    const issuer = await makeIssuer({ ...mode('registry'), maxTokenLifetimeS: 60 })
    await store.createClient({
      issuerId: issuer.id,
      subject: 'billing-service',
      tenantId: 'acme',
      scopes: ['*'],
    })
    const now = Math.floor(Date.now() / 1000)
    const result = await resolveAuthority(
      issuer,
      claims({ iat: now, exp: now + 60 * 60 * 24 * 30 }),
      store,
    )
    expect(result.ok).toBe(true)
  })
})

describe('intersect mode', () => {
  const seed = async (rowScopes: string[]) => {
    const issuer = await makeIssuer(mode('intersect'))
    await store.createClient({
      issuerId: issuer.id,
      subject: 'billing-service',
      tenantId: 'acme',
      scopes: rowScopes,
    })
    return issuer
  }

  it('lets a token narrow itself below the row', async () => {
    const issuer = await seed(['customers:read', 'customers:write', 'vertical:read'])
    const result = await resolveAuthority(issuer, claims({ scope: 'customers:read' }), store)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.principal.scopes).toEqual(['customers:read'])
  })

  it('never widens past the row', async () => {
    // The whole point. A token asking for more than it was granted gets
    // nothing extra — and here, nothing at all.
    const issuer = await seed(['customers:read'])
    const result = await resolveAuthority(issuer, claims({ scope: 'vertical:write' }), store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no_scopes')
  })

  it('resolves a wildcard row through hasScope rather than string equality', async () => {
    const issuer = await seed(['*'])
    const result = await resolveAuthority(
      issuer,
      claims({ scope: 'customers:read vertical:accounting' }),
      store,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.principal.scopes.sort()).toEqual(['customers:read', 'vertical:accounting'])
  })

  it('resolves a resource wildcard the same way', async () => {
    const issuer = await seed(['customers:*'])
    const result = await resolveAuthority(issuer, claims({ scope: 'customers:write' }), store)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.principal.scopes).toEqual(['customers:write'])
  })

  it('still refuses mcp:read beside write authority', async () => {
    // A row granting `*` would otherwise let one token assert both, which is
    // exactly what the mint-time guard on API keys forbids.
    const issuer = await seed(['*'])
    const result = await resolveAuthority(
      issuer,
      claims({ scope: 'mcp:read vertical:write' }),
      store,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('incompatible_scopes')
  })

  it('keeps revocation immediate', async () => {
    const issuer = await seed(['*'])
    const [client] = await store.listClients(issuer.id)
    await store.revokeClient(client.id)
    const result = await resolveAuthority(issuer, claims({ scope: 'customers:read' }), store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unregistered_client')
  })
})

describe('external mode', () => {
  const seed = async (over: Partial<IssuerInput> = {}) =>
    makeIssuer({
      ...mode('external'),
      tenantClaim: 'tenant',
      allowedTenants: ['acme'],
      ...over,
    })

  it('takes tenant and scopes from the token', async () => {
    const issuer = await seed()
    const result = await resolveAuthority(
      issuer,
      claims({ tenant: 'acme', scope: 'customers:read vertical:read' }),
      store,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.principal.tenantId).toBe('acme')
    expect(result.principal.scopes).toEqual(['customers:read', 'vertical:read'])
    // No client row exists, so the principal is named by issuer and subject.
    expect(result.principal.principalId).toBe(`oauth:${issuer.id}:billing-service`)
  })

  it('refuses a tenant outside the allow-list', async () => {
    // Without this the token chooses whose data it reads.
    const issuer = await seed()
    const result = await resolveAuthority(
      issuer,
      claims({ tenant: 'globex', scope: 'customers:read' }),
      store,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('tenant_not_allowed')
  })

  it('admits nobody when the allow-list is empty', async () => {
    // Empty must mean "nobody yet", not "anybody".
    const issuer = await seed({ allowedTenants: [] })
    const result = await resolveAuthority(
      issuer,
      claims({ tenant: 'acme', scope: 'customers:read' }),
      store,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('tenant_not_allowed')
  })

  it('refuses a missing tenant claim', async () => {
    const issuer = await seed()
    const result = await resolveAuthority(issuer, claims({ scope: 'customers:read' }), store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('tenant_claim_missing')
  })

  it('refuses an ambiguous tenant claim rather than picking one', async () => {
    // Two values, one of them allowed. Taking the first would let a token
    // smuggle a tenant past the allow-list by listing it second.
    const issuer = await seed()
    const result = await resolveAuthority(
      issuer,
      claims({ tenant: ['globex', 'acme'], scope: 'customers:read' }),
      store,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('tenant_claim_missing')
  })

  it('refuses a token that outlives the issuer maximum', async () => {
    // The only lever there is: nothing can revoke this token.
    const issuer = await seed({ maxTokenLifetimeS: 300 })
    const now = Math.floor(Date.now() / 1000)
    const result = await resolveAuthority(
      issuer,
      claims({ tenant: 'acme', scope: 'customers:read', iat: now, exp: now + 3600 }),
      store,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('token_lifetime')
  })

  it('refuses a token whose lifetime cannot be bounded at all', async () => {
    const issuer = await seed()
    const now = Math.floor(Date.now() / 1000)
    const result = await resolveAuthority(
      issuer,
      {
        azp: 'billing-service',
        exp: now + 600,
        tenant: 'acme',
        scope: 'customers:read',
      } as JWTPayload,
      store,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('token_lifetime')
  })

  it('passes the scope claim through when no rules are configured', async () => {
    const issuer = await seed()
    const result = await resolveAuthority(
      issuer,
      claims({ tenant: 'acme', scope: 'customers:read' }),
      store,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.principal.scopes).toEqual(['customers:read'])
  })

  it('maps the IdP vocabulary once rules exist, and drops what is unmapped', async () => {
    const issuer = await seed()
    await store.createRule({
      issuerId: issuer.id,
      claimValue: 'read:ledger',
      grantedScope: 'vertical:accounting',
    })
    const result = await resolveAuthority(
      issuer,
      // `vertical:write` is not a rule, so it cannot be smuggled in by naming
      // an OpenSteward scope directly once a rule set exists.
      claims({ tenant: 'acme', scope: 'read:ledger vertical:write' }),
      store,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.principal.scopes).toEqual(['vertical:accounting'])
  })

  it('still refuses mcp:read beside write authority', async () => {
    const issuer = await seed()
    const result = await resolveAuthority(
      issuer,
      claims({ tenant: 'acme', scope: 'mcp:read vertical:write' }),
      store,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('incompatible_scopes')
  })

  it('refuses a token carrying no scopes at all', async () => {
    const issuer = await seed()
    const result = await resolveAuthority(issuer, claims({ tenant: 'acme' }), store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no_scopes')
  })
})

describe('reading the subject', () => {
  it('refuses an absent subject claim', async () => {
    const issuer = await makeIssuer(mode('registry'))
    const result = await resolveAuthority(issuer, { iat: 1, exp: 2 } as JWTPayload, store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no_subject')
  })

  it('refuses an ambiguous subject claim', async () => {
    const issuer = await makeIssuer(mode('registry'))
    const result = await resolveAuthority(issuer, claims({ azp: ['a', 'b'] }), store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no_subject')
  })

  it('reads a nested claim, which is how Keycloak names things', async () => {
    const issuer = await makeIssuer({
      ...mode('external'),
      subjectClaim: 'azp',
      scopeClaim: 'realm_access.roles',
      tenantClaim: 'tenant',
      allowedTenants: ['acme'],
    })
    const result = await resolveAuthority(
      issuer,
      claims({ tenant: 'acme', realm_access: { roles: ['customers:read', 'vertical:read'] } }),
      store,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.principal.scopes).toEqual(['customers:read', 'vertical:read'])
  })
})

describe('mapTokenScopes', () => {
  it('passes everything through when there are no rules', () => {
    expect(mapTokenScopes(['a', 'b'], [])).toEqual(['a', 'b'])
  })

  it('drops unmapped values once any rule exists', () => {
    const rule = {
      id: 'r1',
      issuerId: 'i1',
      priority: 0,
      claimValue: 'a',
      grantedScope: 'customers:read',
    }
    expect(mapTokenScopes(['a', 'b'], [rule])).toEqual(['customers:read'])
  })

  it('collapses two rules granting the same scope', () => {
    const rules = [
      { id: 'r1', issuerId: 'i1', priority: 0, claimValue: 'a', grantedScope: 'customers:read' },
      { id: 'r2', issuerId: 'i1', priority: 1, claimValue: 'b', grantedScope: 'customers:read' },
    ]
    expect(mapTokenScopes(['a', 'b'], rules)).toEqual(['customers:read'])
  })
})
