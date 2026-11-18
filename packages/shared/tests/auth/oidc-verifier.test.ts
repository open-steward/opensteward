/**
 * Verifying a developer's OIDC bearer token.
 *
 * Real keys, real signatures, real JWKS over HTTP — a stubbed verifier would
 * assert that the mock was called, which is precisely the layer where the
 * interesting failures live. The server is local and the SSRF guard is opened
 * with `OST_ALLOW_PRIVATE_HOSTS=1`, the same escape hatch a developer pointing
 * at a Keycloak container uses.
 *
 * The cases that matter are the forgeries. An HS256 token signed with the
 * issuer's *public* key is the classic attack on a JWKS verifier — the key is
 * published, so anyone can mint one — and a blank audience is the most common
 * real-world resource-server hole, because it silently accepts every token the
 * IdP ever issued for anything.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { OAuthClientStore, type IssuerInput } from '../../src/auth/oauth-clients'
import {
  verifyOAuthToken,
  looksLikeJwt,
  resetJwksCache,
  discoverIssuer,
  DiscoveryError,
} from '../../src/auth/oidc-verifier'

const jose = await import('jose')

let server: Server
let origin: string
let issuerUrl: string
let jwksUri: string
let signingKey: CryptoKey
let publicJwk: Record<string, unknown>
let rogueKey: CryptoKey
let spkiPem: string
let previousAllowPrivate: string | undefined

const AUDIENCE = 'https://opensteward.test.internal'

beforeAll(async () => {
  previousAllowPrivate = process.env['OST_ALLOW_PRIVATE_HOSTS']
  process.env['OST_ALLOW_PRIVATE_HOSTS'] = '1'

  const pair = await jose.generateKeyPair('RS256', { extractable: true })
  signingKey = pair.privateKey
  publicJwk = { ...(await jose.exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  spkiPem = await jose.exportSPKI(pair.publicKey)

  // A second, entirely unrelated key whose public half is never published.
  const rogue = await jose.generateKeyPair('RS256', { extractable: true })
  rogueKey = rogue.privateKey

  server = createServer((req, res) => {
    if (req.url === '/.well-known/openid-configuration') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ issuer: issuerUrl, jwks_uri: jwksUri }))
      return
    }
    if (req.url === '/jwks') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ keys: [publicJwk] }))
      return
    }
    if (req.url === '/mismatched/.well-known/openid-configuration') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ issuer: 'https://somebody-else.example/', jwks_uri: jwksUri }))
      return
    }
    res.statusCode = 404
    res.end('no')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  origin = `http://127.0.0.1:${port}`
  issuerUrl = origin
  jwksUri = `${origin}/jwks`
})

afterAll(async () => {
  if (previousAllowPrivate === undefined) delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  else process.env['OST_ALLOW_PRIVATE_HOSTS'] = previousAllowPrivate
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

interface MintOptions {
  claims?: Record<string, unknown>
  audience?: string
  issuer?: string
  expiresIn?: string
  notBefore?: number
  key?: CryptoKey
  kid?: string
}

async function mint(opts: MintOptions = {}): Promise<string> {
  let jwt = new jose.SignJWT({ azp: 'billing-service', scope: 'customers:read', ...opts.claims })
    .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'k1' })
    .setIssuedAt()
    .setIssuer(opts.issuer ?? issuerUrl)
    .setAudience(opts.audience ?? AUDIENCE)
    .setExpirationTime(opts.expiresIn ?? '5m')
  if (opts.notBefore !== undefined) jwt = jwt.setNotBefore(opts.notBefore)
  return jwt.sign(opts.key ?? signingKey)
}

let handle: DbHandle
let store: OAuthClientStore
let issuerId: string

const baseIssuer = (): IssuerInput => ({
  name: 'Local IdP',
  preset: 'generic',
  issuer: issuerUrl,
  jwksUri,
  audience: AUDIENCE,
  subjectClaim: 'azp',
  scopeClaim: 'scope',
})

beforeEach(async () => {
  // Fresh resolver each test: jose caches the key set per URI and applies a
  // refetch cooldown, which would otherwise make key changes invisible.
  resetJwksCache()
  handle = await openDb({ sqlitePath: ':memory:' })
  store = await OAuthClientStore.create(handle)
  const issuer = await store.createIssuer(baseIssuer())
  issuerId = issuer.id
  await store.createClient({
    issuerId,
    subject: 'billing-service',
    tenantId: 'acme',
    scopes: ['customers:read', 'vertical:read'],
  })
})

describe('routing a bearer token to the right verifier', () => {
  it('recognises a JWT and rejects the opaque key formats', () => {
    expect(looksLikeJwt('aaa.bbb.ccc')).toBe(true)
    expect(looksLikeJwt('osk_acme_0123456789abcdef')).toBe(false)
    expect(looksLikeJwt('eut_acme_0123456789abcdef')).toBe(false)
    // An `alg: none` token has an empty third segment and never reaches the
    // verifier at all.
    expect(looksLikeJwt('aaa.bbb.')).toBe(false)
    expect(looksLikeJwt('aaa.bbb')).toBe(false)
  })
})

describe('a well-formed token', () => {
  it('verifies and resolves the registered client', async () => {
    const result = await verifyOAuthToken(await mint(), store)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.principal.tenantId).toBe('acme')
    expect(result.principal.scopes).toEqual(['customers:read', 'vertical:read'])
    expect(result.principal.subject).toBe('billing-service')
    expect(result.principal.principalId).toMatch(/^oauth_client:/)
  })

  it('marks the issuer verified, which the lockout guard reads', async () => {
    expect((await store.getIssuer(issuerId))?.lastVerifiedAt).toBeNull()
    await verifyOAuthToken(await mint(), store)
    expect((await store.getIssuer(issuerId))?.lastVerifiedAt).not.toBeNull()
  })
})

describe('forged and mis-scoped tokens', () => {
  it('refuses HS256 signed with the issuer public key', async () => {
    // The published JWKS is the "secret". Pinning the algorithm list to
    // asymmetric entries is the only thing between this and a total bypass.
    const forged = await new jose.SignJWT({ azp: 'billing-service', scope: 'customers:read' })
      .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .setIssuedAt()
      .setIssuer(issuerUrl)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(spkiPem))

    const result = await verifyOAuthToken(forged, store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('signature')
  })

  it('refuses a signature from a key that is not in the JWKS', async () => {
    const result = await verifyOAuthToken(await mint({ key: rogueKey }), store)
    expect(result.ok).toBe(false)
  })

  it('refuses an unknown kid', async () => {
    const result = await verifyOAuthToken(await mint({ kid: 'not-published' }), store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('signature')
  })

  it('refuses the wrong audience', async () => {
    // A token minted for a different application on the same IdP.
    const result = await verifyOAuthToken(await mint({ audience: 'https://other.app' }), store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('claims')
  })

  it('refuses an issuer nobody registered', async () => {
    const result = await verifyOAuthToken(
      await mint({ issuer: 'https://attacker.example/' }),
      store,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unknown_issuer')
  })

  it('refuses an expired token', async () => {
    const result = await verifyOAuthToken(await mint({ expiresIn: '-1h' }), store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('claims')
  })

  it('refuses a token that is not valid yet', async () => {
    const result = await verifyOAuthToken(
      await mint({ notBefore: Math.floor(Date.now() / 1000) + 600 }),
      store,
    )
    expect(result.ok).toBe(false)
  })

  it('refuses everything once the issuer is disabled', async () => {
    await store.updateIssuer(issuerId, { enabled: false })
    const result = await verifyOAuthToken(await mint(), store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('issuer_disabled')
  })

  it('refuses garbage that is not a token', async () => {
    expect((await verifyOAuthToken('not-a-jwt', store)).ok).toBe(false)
    expect((await verifyOAuthToken('a.b.c', store)).ok).toBe(false)
  })
})

describe('the failure detail is safe to log', () => {
  it('never carries the token or its claims', async () => {
    const token = await mint({ audience: 'https://other.app', claims: { secret_ish: 'hunter2' } })
    const result = await verifyOAuthToken(token, store)
    expect(result.ok).toBe(false)
    if (result.ok) return
    // `detail` is written to the server log. A token in the log is a
    // credential in the log, and `req.headers.authorization` redaction does
    // not reach a string we assembled ourselves.
    expect(result.detail).not.toContain(token)
    expect(result.detail).not.toContain('hunter2')
    expect(result.detail).not.toContain('billing-service')
  })
})

describe('revocation', () => {
  it('cuts off a token that is still perfectly valid', async () => {
    const token = await mint()
    expect((await verifyOAuthToken(token, store)).ok).toBe(true)

    const [client] = await store.listClients(issuerId)
    await store.revokeClient(client.id)

    // Same token, same signature, still inside its lifetime. This is the
    // property registry mode exists for and the one external mode gives up.
    const after = await verifyOAuthToken(token, store)
    expect(after.ok).toBe(false)
    if (after.ok) return
    expect(after.reason).toBe('unregistered_client')
  })
})

describe('discovery', () => {
  it('resolves the JWKS URI', async () => {
    const doc = await discoverIssuer(issuerUrl)
    expect(doc.issuer).toBe(issuerUrl)
    expect(doc.jwksUri).toBe(jwksUri)
  })

  it('refuses a document that claims to be a different issuer', async () => {
    // Otherwise a hostile or misconfigured discovery endpoint could point the
    // deployment at somebody else's signing keys. Asserted on the message, not
    // just the error type: the document has to actually be served, or this
    // passes on a 404 and proves nothing.
    await expect(discoverIssuer(`${origin}/mismatched`)).rejects.toThrow(
      /reports issuer "https:\/\/somebody-else\.example\/"/,
    )
  })

  it('reports a missing document rather than throwing something opaque', async () => {
    await expect(discoverIssuer(`${origin}/nowhere`)).rejects.toThrow(DiscoveryError)
  })
})
