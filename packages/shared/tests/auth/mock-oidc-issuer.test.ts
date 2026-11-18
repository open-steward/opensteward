/**
 * The mock issuer mints tokens a standards-following verifier accepts, and
 * carries exactly the claims the authority model reads.
 *
 * Verified here with jose against the issuer's own published JWK — the same
 * thing a real resource server does with a real IdP's JWKS — so a change that
 * broke `kid`, the algorithm or the audience would fail here before it
 * confused a deployment.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  createMockIssuerKeys,
  discoveryDocument,
  jwksDocument,
  mintMockToken,
  MOCK_MODE_CLAIM,
  type MockIssuerKeys,
} from '../../src/auth/mock-oidc-issuer'

let jose: typeof import('jose', { with: { 'resolution-mode': 'import' } })
let keys: MockIssuerKeys

beforeAll(async () => {
  jose = await import('jose')
  keys = await createMockIssuerKeys('k-test')
})

const ISSUER = 'http://localhost:3010/test/oidc'
const AUD = 'https://opensteward.test'

describe('mock OIDC issuer', () => {
  it('publishes one RS256 signing key, and discovery that points at it', () => {
    const jwks = jwksDocument(keys)
    expect(jwks.keys).toHaveLength(1)
    expect(jwks.keys[0]).toMatchObject({ kid: 'k-test', alg: 'RS256', use: 'sig', kty: 'RSA' })
    const doc = discoveryDocument(ISSUER)
    expect(doc['issuer']).toBe(ISSUER)
    expect(doc['jwks_uri']).toBe(`${ISSUER}/jwks`)
    expect(doc['token_endpoint']).toBe(`${ISSUER}/token`)
    expect(doc['grant_types_supported']).toEqual(['client_credentials'])
  })

  it('mints a token the published key verifies, with the claims the authority model reads', async () => {
    const minted = await mintMockToken(keys, {
      issuer: ISSUER,
      audience: AUD,
      subject: 'billing-service',
      scope: ['customers:read', 'vertical:accounting'],
      tenant: 'acme',
      mode: 'test',
    })
    const key = await jose.importJWK(jwksDocument(keys).keys[0]!, 'RS256')
    const { payload, protectedHeader } = await jose.jwtVerify(minted.token, key, {
      issuer: ISSUER,
      audience: AUD,
      algorithms: ['RS256'],
    })
    expect(protectedHeader.kid).toBe('k-test')
    expect(payload.sub).toBe('billing-service')
    expect(payload['azp']).toBe('billing-service')
    expect(payload['scope']).toBe('customers:read vertical:accounting')
    expect(payload['tenant']).toBe('acme')
    expect(payload[MOCK_MODE_CLAIM]).toBe('test')
    expect(typeof payload.iat).toBe('number')
    expect(payload.exp! - payload.iat!).toBe(3600)
    expect(minted.expiresIn).toBe(3600)
    expect(minted.scope).toBe('customers:read vertical:accounting')
  })

  it('omits the test-mode marker for a live-mode token, and honours a custom tenant claim', async () => {
    const minted = await mintMockToken(keys, {
      issuer: ISSUER,
      audience: AUD,
      subject: 'ops',
      tenant: 'acme',
      tenantClaim: 'https://opensteward/tenant',
      mode: 'live',
      expiresInS: 120,
    })
    const payload = jose.decodeJwt(minted.token)
    expect(payload[MOCK_MODE_CLAIM]).toBeUndefined()
    expect(payload['https://opensteward/tenant']).toBe('acme')
    expect(payload['tenant']).toBeUndefined()
    expect(payload.exp! - payload.iat!).toBe(120)
  })

  it('refuses to verify under the wrong audience or a foreign key', async () => {
    const minted = await mintMockToken(keys, {
      issuer: ISSUER,
      audience: AUD,
      subject: 's',
      mode: 'test',
    })
    const key = await jose.importJWK(jwksDocument(keys).keys[0]!, 'RS256')
    await expect(
      jose.jwtVerify(minted.token, key, { issuer: ISSUER, audience: 'https://other' }),
    ).rejects.toThrow()
    const other = await createMockIssuerKeys('k-other')
    const otherKey = await jose.importJWK(jwksDocument(other).keys[0]!, 'RS256')
    await expect(
      jose.jwtVerify(minted.token, otherKey, { issuer: ISSUER, audience: AUD }),
    ).rejects.toThrow()
  })
})
