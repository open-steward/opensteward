/**
 * Which headers the CLI sends for which credential.
 *
 * The public API accepts an `osk_` key as either a Bearer token or
 * `X-Api-Key`, and the CLI sends both so either server configuration
 * works. An OIDC bearer token is a different credential: `X-Api-Key` means
 * "this is an API key", no deployment reads a JWT out of it, and copying the
 * token there only widens where a live credential travels — into proxy logs
 * and access logs that were never told to redact that header.
 *
 * Driven through `makeClient` with a fake fetch rather than by exporting the
 * header builder, so what is asserted is what actually goes on the wire.
 */
import { describe, it, expect } from 'vitest'
import { makeClient } from '../src/client'

/** Three dot-separated base64url segments, signed by nobody — shape is all that matters. */
const JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJiaWxsaW5nIn0.c2lnbmF0dXJl'
const API_KEY = 'osk_acme_0123456789abcdef0123456789abcdef'

function capture(): { fetch: typeof globalThis.fetch; headers: Record<string, string>[] } {
  const headers: Record<string, string>[] = []
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const req = new Request(input as RequestInfo, init)
    const seen: Record<string, string> = {}
    req.headers.forEach((v, k) => {
      seen[k] = v
    })
    headers.push(seen)
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { fetch: fakeFetch, headers }
}

async function headersFor(
  spec: 'public' | 'operator',
  token: string,
): Promise<Record<string, string>> {
  const { fetch, headers } = capture()
  const original = globalThis.fetch
  globalThis.fetch = fetch
  try {
    const client = makeClient(spec, { baseUrl: 'https://api.example.com', token })
    await client.request('GET', '/v1/customers')
  } finally {
    globalThis.fetch = original
  }
  return headers[0] ?? {}
}

describe('the public API', () => {
  it('sends an API key as Bearer and as X-Api-Key', async () => {
    const sent = await headersFor('public', API_KEY)
    expect(sent['authorization']).toBe(`Bearer ${API_KEY}`)
    expect(sent['x-api-key']).toBe(API_KEY)
  })

  it('sends an OIDC token as Bearer only', async () => {
    const sent = await headersFor('public', JWT)
    expect(sent['authorization']).toBe(`Bearer ${JWT}`)
    expect(sent['x-api-key']).toBeUndefined()
  })
})

describe('the operator API', () => {
  it('sends Bearer only, whatever the credential looks like', async () => {
    const sent = await headersFor('operator', JWT)
    expect(sent['authorization']).toBe(`Bearer ${JWT}`)
    expect(sent['x-api-key']).toBeUndefined()
  })
})
