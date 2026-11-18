/**
 * OAuthClientStore — the operator's configuration for accepting OIDC bearer
 * tokens on the developer API.
 *
 * Most of what is asserted here is refusal. Every rule in `validateIssuerInput`
 * exists because the permissive version of it is a hole rather than a typo: a
 * blank audience accepts every token the issuer ever minted, an HMAC algorithm
 * against a published JWKS lets anyone forge one, and `external` mode with no
 * tenant claim decides tenancy from nothing. The store is the last place that
 * sees a whole row, so the checks live here and not only at the HTTP boundary.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { IncompatibleMcpScopesError } from '../../src/auth/api-keys'
import {
  OAuthClientStore,
  InvalidIssuerError,
  validateIssuerInput,
  DEFAULT_ALGORITHMS,
  DEFAULT_MAX_TOKEN_LIFETIME_S,
  type IssuerInput,
} from '../../src/auth/oauth-clients'

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

const issuerInput = (over: Partial<IssuerInput> = {}): IssuerInput => ({
  name: 'Corp Keycloak',
  preset: 'keycloak',
  issuer: 'https://idp.example.com/realms/corp',
  jwksUri: 'https://idp.example.com/realms/corp/protocol/openid-connect/certs',
  audience: 'https://opensteward.corp.internal',
  subjectClaim: 'azp',
  scopeClaim: 'realm_access.roles',
  ...over,
})

describe.each(BACKENDS)('OAuthClientStore [$name]', (backend) => {
  let handle: DbHandle
  let store: OAuthClientStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await OAuthClientStore.create(handle)
  })

  afterEach(async () => {
    // Stores are borrowers — close the shared handle, not the store.
    await handle?.close()
  })

  describe('creating an issuer', () => {
    it('round-trips a full row and defaults the rest', async () => {
      const created = await store.createIssuer(issuerInput())
      expect(created.issuer).toBe('https://idp.example.com/realms/corp')
      expect(created.authorityMode).toBe('registry')
      expect(created.algorithms).toEqual([...DEFAULT_ALGORITHMS])
      expect(created.maxTokenLifetimeS).toBe(DEFAULT_MAX_TOKEN_LIFETIME_S)
      expect(created.enabled).toBe(true)
      expect(created.lastVerifiedAt).toBeNull()
      expect(created.allowedTenants).toEqual([])

      const fetched = await store.getIssuer(created.id)
      expect(fetched).toEqual(created)
    })

    it('finds an issuer by the iss value a token carries', async () => {
      const created = await store.createIssuer(issuerInput())
      const found = await store.getIssuerByIss('https://idp.example.com/realms/corp')
      expect(found?.id).toBe(created.id)
      expect(await store.getIssuerByIss('https://elsewhere.example/')).toBeNull()
    })
  })

  describe('refusing an unsafe issuer', () => {
    it('refuses a blank audience', async () => {
      // Without an audience, every token this issuer minted for any
      // application authenticates here — including an ID token, and including
      // one minted for an unrelated app on the same IdP tenant.
      await expect(store.createIssuer(issuerInput({ audience: '   ' }))).rejects.toThrow(
        InvalidIssuerError,
      )
    })

    it('refuses an HMAC algorithm', () => {
      // The forgery this prevents: sign HS256 using the issuer's PUBLIC key as
      // the shared secret. The key is published in the JWKS, so anyone can.
      expect(() => validateIssuerInput(issuerInput({ algorithms: ['HS256'] }))).toThrow(
        /asymmetric/,
      )
    })

    it('refuses "none"', () => {
      expect(() => validateIssuerInput(issuerInput({ algorithms: ['none'] }))).toThrow(
        InvalidIssuerError,
      )
    })

    it('refuses an empty algorithm list rather than meaning "any"', () => {
      expect(() => validateIssuerInput(issuerInput({ algorithms: [] }))).toThrow(InvalidIssuerError)
    })

    it('refuses a plain-http issuer', () => {
      // Anyone on the path could otherwise swap the discovery document, and
      // with it the signing keys.
      const previous = process.env['OST_ALLOW_PRIVATE_HOSTS']
      delete process.env['OST_ALLOW_PRIVATE_HOSTS']
      try {
        expect(() =>
          validateIssuerInput(issuerInput({ issuer: 'http://idp.example.com/realms/corp' })),
        ).toThrow(/https/)
      } finally {
        if (previous !== undefined) process.env['OST_ALLOW_PRIVATE_HOSTS'] = previous
      }
    })

    it('refuses external mode with no tenant claim', () => {
      // In external mode the tenant arrives inside the token. Guessing which
      // claim carries it would decide tenancy by lottery.
      expect(() => validateIssuerInput(issuerInput({ authorityMode: 'external' }))).toThrow(
        /tenant claim/i,
      )
    })

    it('accepts external mode once a tenant claim is named', () => {
      expect(() =>
        validateIssuerInput(
          issuerInput({ authorityMode: 'external', tenantClaim: 'https://opensteward/tenant' }),
        ),
      ).not.toThrow()
    })

    it('refuses a non-positive token lifetime', () => {
      expect(() => validateIssuerInput(issuerInput({ maxTokenLifetimeS: 0 }))).toThrow(
        InvalidIssuerError,
      )
    })
  })

  describe('updating an issuer', () => {
    it('validates the merged row, not just the patch', async () => {
      // A patch flipping only the mode would otherwise land a row with no
      // tenant claim, which is a decision made at request time instead of at
      // save time.
      const created = await store.createIssuer(issuerInput())
      await expect(store.updateIssuer(created.id, { authorityMode: 'external' })).rejects.toThrow(
        /tenant claim/i,
      )
      const unchanged = await store.getIssuer(created.id)
      expect(unchanged?.authorityMode).toBe('registry')
    })

    it('accepts the same switch when the patch supplies what it needs', async () => {
      const created = await store.createIssuer(issuerInput())
      const updated = await store.updateIssuer(created.id, {
        authorityMode: 'external',
        tenantClaim: 'tid',
        allowedTenants: ['default'],
      })
      expect(updated?.authorityMode).toBe('external')
      expect(updated?.allowedTenants).toEqual(['default'])
    })

    it('clears the verified marker when what is trusted changes', async () => {
      const created = await store.createIssuer(issuerInput())
      await store.markVerified(created.id)
      expect((await store.getIssuer(created.id))?.lastVerifiedAt).not.toBeNull()

      await store.updateIssuer(created.id, { audience: 'https://something-else.internal' })
      // The proof that it works was proof about a different configuration.
      expect((await store.getIssuer(created.id))?.lastVerifiedAt).toBeNull()
    })

    it('keeps the verified marker for a cosmetic change', async () => {
      const created = await store.createIssuer(issuerInput())
      await store.markVerified(created.id)
      await store.updateIssuer(created.id, { name: 'Renamed' })
      expect((await store.getIssuer(created.id))?.lastVerifiedAt).not.toBeNull()
    })

    it('returns null for an issuer that is not there', async () => {
      expect(await store.updateIssuer('nope', { name: 'x' })).toBeNull()
    })
  })

  describe('clients', () => {
    it('resolves a registered subject, and stops the moment it is revoked', async () => {
      const issuer = await store.createIssuer(issuerInput())
      const client = await store.createClient({
        issuerId: issuer.id,
        subject: 'billing-service',
        tenantId: 'acme',
        scopes: ['customers:read'],
      })

      expect((await store.getClientBySubject(issuer.id, 'billing-service'))?.id).toBe(client.id)
      expect(await store.hasActiveClient(issuer.id)).toBe(true)

      expect(await store.revokeClient(client.id)).toBe(true)
      // This is the property the registry exists for: the token in the
      // caller's hand is still perfectly valid and still stops working.
      expect(await store.getClientBySubject(issuer.id, 'billing-service')).toBeNull()
      expect(await store.hasActiveClient(issuer.id)).toBe(false)
      expect(await store.revokeClient(client.id)).toBe(false)
    })

    it('refuses mcp:read alongside write authority, exactly as minting a key does', async () => {
      const issuer = await store.createIssuer(issuerInput())
      await expect(
        store.createClient({
          issuerId: issuer.id,
          subject: 'agent',
          tenantId: 'acme',
          scopes: ['mcp:read', 'vertical:write'],
        }),
      ).rejects.toThrow(IncompatibleMcpScopesError)
    })

    it('scopes the subject lookup to its own issuer', async () => {
      const a = await store.createIssuer(issuerInput())
      const b = await store.createIssuer(
        issuerInput({ name: 'Other', issuer: 'https://other.example.com/' }),
      )
      await store.createClient({
        issuerId: a.id,
        subject: 'shared-name',
        tenantId: 'acme',
        scopes: ['*'],
      })
      // Same subject string, different issuer — not the same principal.
      expect(await store.getClientBySubject(b.id, 'shared-name')).toBeNull()
    })

    it('records last use', async () => {
      const issuer = await store.createIssuer(issuerInput())
      const client = await store.createClient({
        issuerId: issuer.id,
        subject: 's',
        tenantId: 'acme',
        scopes: ['*'],
      })
      expect(client.lastUsedAt).toBeNull()
      await store.touchClient(client.id, 1_700_000_000_000)
      const rows = await store.listClients(issuer.id)
      expect(rows[0].lastUsedAt).toBe(1_700_000_000_000)
    })
  })

  describe('scope rules', () => {
    it('round-trips in priority order', async () => {
      const issuer = await store.createIssuer(issuerInput())
      await store.createRule({
        issuerId: issuer.id,
        priority: 2,
        claimValue: 'write:ledger',
        grantedScope: 'vertical:write',
      })
      await store.createRule({
        issuerId: issuer.id,
        priority: 1,
        claimValue: 'read:ledger',
        grantedScope: 'vertical:accounting',
      })
      const rules = await store.listRules(issuer.id)
      expect(rules.map((r) => r.claimValue)).toEqual(['read:ledger', 'write:ledger'])
    })
  })

  describe('deleting an issuer', () => {
    it('takes its clients and rules with it', async () => {
      const issuer = await store.createIssuer(issuerInput())
      await store.createClient({
        issuerId: issuer.id,
        subject: 's',
        tenantId: 'acme',
        scopes: ['*'],
      })
      await store.createRule({
        issuerId: issuer.id,
        claimValue: 'a',
        grantedScope: 'customers:read',
      })

      expect(await store.deleteIssuer(issuer.id)).toBe(true)
      // Orphaned clients would keep authenticating against an issuer the
      // operator believes they deleted.
      expect(await store.listClients(issuer.id)).toEqual([])
      expect(await store.listRules(issuer.id)).toEqual([])
      expect(await store.deleteIssuer(issuer.id)).toBe(false)
    })
  })
})
