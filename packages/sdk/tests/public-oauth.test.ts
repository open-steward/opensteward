/**
 * Authenticating the public SDK client with an OIDC bearer token.
 *
 * A token is not a key: it expires, so it cannot be baked into the client's
 * headers at construction the way `apiKey` is. These pin that it is fetched
 * per request, that the cache actually stops the SDK hammering the IdP's token
 * endpoint, and — the one that matters — that a failed token request never
 * puts the client secret into an error message, since IdPs routinely echo it
 * back in `error_description`.
 *
 * Same hermetic fake `fetch` as `public.test.ts`.
 */
import { describe, expect, it } from 'vitest'

import { clientCredentialsTokenSource, createPublicClient } from '../src/public'

interface Captured {
  url: string
  headers: Record<string, string>
  body: string | null
}

function capture(responder: (url: string) => { body: unknown; status?: number }): {
  fetch: typeof globalThis.fetch
  calls: Captured[]
} {
  const calls: Captured[] = []
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const req = new Request(input as RequestInfo, init)
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => {
      headers[k] = v
    })
    calls.push({ url: req.url, headers, body: init?.body ? String(init.body) : null })
    const { body, status = 200 } = responder(req.url)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { fetch: fakeFetch, calls }
}

describe('createPublicClient with a token source', () => {
  it('asks for a token on every request rather than once at construction', async () => {
    const { fetch, calls } = capture(() => ({ body: { data: [] } }))
    let issued = 0
    const client = createPublicClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => `token-${++issued}`,
      options: { fetch },
    })

    await client.GET('/v1/customers')
    await client.GET('/v1/customers')

    // A fixed string in the constructor could not do this: the second call
    // carries the token that existed when it was made.
    expect(calls[0].headers['authorization']).toBe('Bearer token-1')
    expect(calls[1].headers['authorization']).toBe('Bearer token-2')
  })

  it('awaits an async source', async () => {
    const { fetch, calls } = capture(() => ({ body: { data: [] } }))
    const client = createPublicClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: async () => 'async-token',
      options: { fetch },
    })
    await client.GET('/v1/customers')
    expect(calls[0].headers['authorization']).toBe('Bearer async-token')
  })

  it('still keeps caller-supplied headers', async () => {
    const { fetch, calls } = capture(() => ({ body: { data: [] } }))
    const client = createPublicClient({
      baseUrl: 'https://api.example.com',
      getAccessToken: () => 't',
      options: { fetch, headers: { 'x-trace': 'abc' } },
    })
    await client.GET('/v1/customers')
    expect(calls[0].headers['x-trace']).toBe('abc')
  })
})

describe('clientCredentialsTokenSource', () => {
  const TOKEN_URL = 'https://idp.example.com/oauth/token'

  it('exchanges the client credentials and returns the token', async () => {
    const { fetch, calls } = capture(() => ({
      body: { access_token: 'eyJ-first', expires_in: 3600 },
    }))
    const source = clientCredentialsTokenSource({
      tokenUrl: TOKEN_URL,
      clientId: 'svc',
      clientSecret: 'shh',
      audience: 'https://opensteward.internal',
      scope: 'customers:read',
      fetchImpl: fetch,
    })

    expect(await source()).toBe('eyJ-first')
    const body = new URLSearchParams(calls[0].body ?? '')
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('audience')).toBe('https://opensteward.internal')
    expect(body.get('scope')).toBe('customers:read')
  })

  it('reuses the token instead of asking again', async () => {
    let issued = 0
    const { fetch, calls } = capture(() => ({
      body: { access_token: `eyJ-${++issued}`, expires_in: 3600 },
    }))
    const source = clientCredentialsTokenSource({
      tokenUrl: TOKEN_URL,
      clientId: 'svc',
      clientSecret: 'shh',
      fetchImpl: fetch,
    })

    expect(await source()).toBe('eyJ-1')
    expect(await source()).toBe('eyJ-1')
    expect(await source()).toBe('eyJ-1')
    // Without the cache this is one token request per API call.
    expect(calls).toHaveLength(1)
  })

  it('re-fetches once the token is close enough to expiry', async () => {
    let issued = 0
    const { fetch, calls } = capture(() => ({
      // Shorter than the 60s refresh skew, so it is already due on return.
      body: { access_token: `eyJ-${++issued}`, expires_in: 30 },
    }))
    const source = clientCredentialsTokenSource({
      tokenUrl: TOKEN_URL,
      clientId: 'svc',
      clientSecret: 'shh',
      fetchImpl: fetch,
    })

    expect(await source()).toBe('eyJ-1')
    expect(await source()).toBe('eyJ-2')
    expect(calls).toHaveLength(2)
  })

  it('collapses concurrent callers into one token request', async () => {
    let issued = 0
    const { fetch, calls } = capture(() => ({
      body: { access_token: `eyJ-${++issued}`, expires_in: 3600 },
    }))
    const source = clientCredentialsTokenSource({
      tokenUrl: TOKEN_URL,
      clientId: 'svc',
      clientSecret: 'shh',
      fetchImpl: fetch,
    })

    // A burst at startup would otherwise be a stampede on the IdP.
    const all = await Promise.all([source(), source(), source(), source()])
    expect(all).toEqual(['eyJ-1', 'eyJ-1', 'eyJ-1', 'eyJ-1'])
    expect(calls).toHaveLength(1)
  })

  it('never puts the client secret in the error', async () => {
    // IdPs routinely echo the submitted credentials back in
    // `error_description`. Including the response body here would move the
    // secret into every log and stack trace that catches this.
    const { fetch } = capture(() => ({
      body: { error: 'invalid_client', error_description: 'client_secret "shh" is wrong' },
      status: 401,
    }))
    const source = clientCredentialsTokenSource({
      tokenUrl: TOKEN_URL,
      clientId: 'svc',
      clientSecret: 'shh',
      fetchImpl: fetch,
    })

    await expect(source()).rejects.toThrow(/failed with 401/)
    await expect(source()).rejects.not.toThrow(/shh/)
  })

  it('reports a token endpoint that answers 200 with nothing usable', async () => {
    const { fetch } = capture(() => ({ body: { token_type: 'Bearer' } }))
    const source = clientCredentialsTokenSource({
      tokenUrl: TOKEN_URL,
      clientId: 'svc',
      clientSecret: 'shh',
      fetchImpl: fetch,
    })
    await expect(source()).rejects.toThrow(/no access_token/)
  })

  it('retries after a failure rather than caching the error', async () => {
    let attempt = 0
    const { fetch } = capture(() => {
      attempt += 1
      return attempt === 1
        ? { body: { error: 'temporarily_unavailable' }, status: 503 }
        : { body: { access_token: 'eyJ-recovered', expires_in: 3600 } }
    })
    const source = clientCredentialsTokenSource({
      tokenUrl: TOKEN_URL,
      clientId: 'svc',
      clientSecret: 'shh',
      fetchImpl: fetch,
    })

    await expect(source()).rejects.toThrow()
    // The in-flight promise must be cleared on rejection, or every later call
    // returns the same failure forever.
    expect(await source()).toBe('eyJ-recovered')
  })
})
