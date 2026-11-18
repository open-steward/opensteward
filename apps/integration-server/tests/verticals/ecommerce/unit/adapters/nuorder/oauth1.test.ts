/**
 * Known-answer test for the RFC 5849 OAuth 1.0a HMAC-SHA1 signer.
 *
 * The expected base string and signature below were computed independently
 * with Node's `crypto` primitives directly (percent-encode each param per
 * RFC 3986, sort by key, join as `k=v&k=v`, base string =
 * `METHOD&url-encoded(url)&url-encoded(params)`, HMAC-SHA1 with key
 * `consumerSecret&tokenSecret`, base64 digest) — a from-scratch computation
 * against the textbook algorithm, not derived from this file's own code —
 * so a regression in percent-encoding, key sorting, or the signing-key
 * construction changes the output and fails this test.
 *
 * Header transmission and signature-method verified against
 * https://assets.nuorder.com/api-docs/index.html (see oauth1.ts header).
 */
import { describe, it, expect } from 'vitest'
import {
  buildBaseString,
  computeSignature,
  buildAuthorizationHeader,
  percentEncode,
  signingKey,
} from '../../../../../../src/verticals/ecommerce/adapters/nuorder/oauth1'

const FIXTURE = {
  method: 'GET',
  url: 'https://sandbox1.nuorder.com/api/products',
  consumerKey: 'test_consumer_key',
  consumerSecret: 'test_consumer_secret',
  token: 'test_token',
  tokenSecret: 'test_token_secret',
  nonce: 'fixednonce1234567890',
  timestamp: '1700000000',
  queryParams: { __limit: '50' },
}

const EXPECTED_BASE_STRING =
  'GET&https%3A%2F%2Fsandbox1.nuorder.com%2Fapi%2Fproducts&' +
  '__limit%3D50%26oauth_consumer_key%3Dtest_consumer_key%26' +
  'oauth_nonce%3Dfixednonce1234567890%26oauth_signature_method%3DHMAC-SHA1%26' +
  'oauth_timestamp%3D1700000000%26oauth_token%3Dtest_token%26oauth_version%3D1.0'

const EXPECTED_SIGNATURE = 'PU9KozXm1PWOZ3H1LQXR5iffkyw='

describe('buildBaseString (RFC 5849 known-answer)', () => {
  it('matches the independently-computed base string', () => {
    const params = {
      oauth_consumer_key: FIXTURE.consumerKey,
      oauth_nonce: FIXTURE.nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: FIXTURE.timestamp,
      oauth_token: FIXTURE.token,
      oauth_version: '1.0',
      ...FIXTURE.queryParams,
    }
    expect(buildBaseString(FIXTURE.method, FIXTURE.url, params)).toBe(EXPECTED_BASE_STRING)
  })
})

describe('computeSignature (RFC 5849 known-answer)', () => {
  it('matches the independently-computed HMAC-SHA1 base64 signature', () => {
    const sig = computeSignature(EXPECTED_BASE_STRING, FIXTURE.consumerSecret, FIXTURE.tokenSecret)
    expect(sig).toBe(EXPECTED_SIGNATURE)
  })
})

describe('signingKey', () => {
  it('joins percent-encoded consumer secret and token secret with &', () => {
    expect(signingKey('a&b', 'c d')).toBe('a%26b&c%20d')
  })
})

describe('percentEncode', () => {
  it('escapes RFC 3986 reserved characters encodeURIComponent leaves bare', () => {
    expect(percentEncode("a!*'()b")).toBe('a%21%2A%27%28%29b')
  })
})

describe('buildAuthorizationHeader', () => {
  const creds = {
    consumerKey: FIXTURE.consumerKey,
    consumerSecret: FIXTURE.consumerSecret,
    token: FIXTURE.token,
    tokenSecret: FIXTURE.tokenSecret,
  }

  it('produces the exact known-answer signature end to end with fixed nonce/timestamp', () => {
    const header = buildAuthorizationHeader(
      FIXTURE.method,
      FIXTURE.url,
      creds,
      FIXTURE.queryParams,
      { nonce: FIXTURE.nonce, timestamp: FIXTURE.timestamp },
    )
    expect(header).toContain(`oauth_signature="${percentEncode(EXPECTED_SIGNATURE)}"`)
  })

  it('sends oauth_* parameters as an OAuth Authorization header, not the query string', () => {
    const header = buildAuthorizationHeader(FIXTURE.method, FIXTURE.url, creds, {})
    expect(header).toMatch(/^OAuth /)
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"')
    expect(header).toContain('oauth_version="1.0"')
    expect(header).toContain(`oauth_consumer_key="${FIXTURE.consumerKey}"`)
    expect(header).toContain(`oauth_token="${FIXTURE.token}"`)
  })

  it('includes URL query parameters in the signed base string', () => {
    const withQuery = buildAuthorizationHeader(
      'GET',
      'https://sandbox1.nuorder.com/api/products?__limit=50',
      creds,
      {},
      { nonce: FIXTURE.nonce, timestamp: FIXTURE.timestamp },
    )
    const withoutQuery = buildAuthorizationHeader(
      'GET',
      'https://sandbox1.nuorder.com/api/products',
      creds,
      { __limit: '50' },
      { nonce: FIXTURE.nonce, timestamp: FIXTURE.timestamp },
    )
    // Same signed params whether they arrive via the URL or the queryParams arg.
    expect(withQuery).toBe(withoutQuery)
  })

  it('produces a different signature for a different HTTP method (base string includes the method)', () => {
    const get = buildAuthorizationHeader(FIXTURE.method, FIXTURE.url, creds, FIXTURE.queryParams, {
      nonce: FIXTURE.nonce,
      timestamp: FIXTURE.timestamp,
    })
    const put = buildAuthorizationHeader('PUT', FIXTURE.url, creds, FIXTURE.queryParams, {
      nonce: FIXTURE.nonce,
      timestamp: FIXTURE.timestamp,
    })
    expect(get).not.toBe(put)
  })
})
