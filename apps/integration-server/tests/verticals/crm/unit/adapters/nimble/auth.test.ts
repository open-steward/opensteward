/**
 * Nimble OAuth endpoints (Authentication section of
 * https://www.nimble.com/developers/docs/):
 *   "GET https://app.nimble.com/oauth/authorize"
 *   "POST https://app.nimble.com/api/oauth/token"
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NimbleAdapter } from '../../../../../../src/verticals/crm/adapters/nimble/index'

afterEach(() => {
  vi.unstubAllGlobals()
})

function tokenFake() {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      return new Response(
        JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }),
  )
  return urls
}

describe('nimble oauth', () => {
  const adapter = new NimbleAdapter({
    clientId: 'cid',
    clientSecret: 'secret',
    redirectUri: 'https://example.test/cb',
  })

  it('authorizes at the documented URL', () => {
    expect(adapter.getAuthUrl('st').startsWith('https://app.nimble.com/oauth/authorize?')).toBe(
      true,
    )
  })

  it('exchanges the code at the documented token URL', async () => {
    const urls = tokenFake()
    await adapter.exchangeCode('code', 'https://example.test/cb')
    expect(urls).toEqual(['https://app.nimble.com/api/oauth/token'])
  })

  it('refreshes at the documented token URL', async () => {
    const urls = tokenFake()
    await adapter.refreshCredentials({ accessToken: 'old', refreshToken: 'r0' })
    expect(urls).toEqual(['https://app.nimble.com/api/oauth/token'])
  })
})
