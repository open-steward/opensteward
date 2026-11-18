/**
 * KitchenHub auth, per the Auth API guide
 * (https://kitchenhub.readme.io/reference/auth-api.md) and the "Create pair
 * tokens" / "Update access token" operations
 * (https://kitchenhub.readme.io/reference/post_v2-auth-token-1.md,
 * .../post_v2-auth-token-refresh-1.md): POST /v2/auth/token/ with
 * { client_id, client_secret }, POST /v2/auth/token/refresh/ with
 * { refresh_token }; expiries are in minutes.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { KitchenHubAdapter } from '../../../../../../src/verticals/logistics/adapters/kitchenhub/index'

const NOW = new Date('2026-09-24T12:00:00Z')

interface Sent {
  url: string
  body: unknown
}

function mockFetch(
  handler: (url: string, body: Record<string, unknown>) => { status: number; json: unknown },
) {
  const sent: Sent[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    sent.push({ url, body })
    const r = handler(url, body)
    return new Response(JSON.stringify(r.json), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    })
  })
  return sent
}

const PAIR = {
  access_token: 'acc1',
  refresh_token: 'ref1',
  access_token_expire: 1800,
  refresh_token_expire: 3600,
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('kitchenhub auth', () => {
  it('asks for a client id and secret', () => {
    expect(new KitchenHubAdapter().credentialFields().map((f) => f.name)).toEqual([
      'clientId',
      'clientSecret',
    ])
  })

  it('exchanges them at POST https://api.kitchenhub.app/v2/auth/token/ for a token pair', async () => {
    const sent = mockFetch(() => ({ status: 200, json: PAIR }))
    const creds = await new KitchenHubAdapter().exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'sec',
    })
    expect(sent).toEqual([
      {
        url: 'https://api.kitchenhub.app/v2/auth/token/',
        body: { client_id: 'cid', client_secret: 'sec' },
      },
    ])
    expect(creds.accessToken).toBe('acc1')
    expect(creds.refreshToken).toBe('ref1')
    // access_token_expire is in minutes.
    expect(creds.expiresAt?.toISOString()).toBe(
      new Date(NOW.getTime() + 1800 * 60_000).toISOString(),
    )
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'sec' })
  })

  it('refuses a missing client secret without a request', async () => {
    const sent = mockFetch(() => ({ status: 200, json: PAIR }))
    await expect(new KitchenHubAdapter().exchangeCredentials({ clientId: 'cid' })).rejects.toThrow(
      /required/,
    )
    expect(sent).toEqual([])
  })

  it('refreshes at POST https://api.kitchenhub.app/v2/auth/token/refresh/ and stores the new refresh token', async () => {
    const sent = mockFetch(() => ({
      status: 200,
      json: { access_token: 'acc2', refresh_token: 'ref2', access_token_expire: 30 },
    }))
    const creds = await new KitchenHubAdapter().refreshCredentials({
      accessToken: 'acc1',
      refreshToken: 'ref1',
      extra: { clientId: 'cid', clientSecret: 'sec' },
    })
    expect(sent).toEqual([
      { url: 'https://api.kitchenhub.app/v2/auth/token/refresh/', body: { refresh_token: 'ref1' } },
    ])
    expect(creds).toEqual(
      expect.objectContaining({
        accessToken: 'acc2',
        refreshToken: 'ref2',
        extra: { clientId: 'cid', clientSecret: 'sec' },
      }),
    )
    expect(creds.expiresAt?.toISOString()).toBe(new Date(NOW.getTime() + 30 * 60_000).toISOString())
  })

  it('creates a new pair from the stored client id and secret when the refresh token is rejected', async () => {
    const sent = mockFetch((url) =>
      url.endsWith('/refresh/')
        ? { status: 401, json: { detail: 'expired' } }
        : { status: 200, json: PAIR },
    )
    const creds = await new KitchenHubAdapter().refreshCredentials({
      accessToken: 'old',
      refreshToken: 'dead',
      extra: { clientId: 'cid', clientSecret: 'sec' },
    })
    expect(sent.map((s) => s.url)).toEqual([
      'https://api.kitchenhub.app/v2/auth/token/refresh/',
      'https://api.kitchenhub.app/v2/auth/token/',
    ])
    expect(creds.accessToken).toBe('acc1')
  })

  it('surfaces a rejected refresh when no client id and secret are stored', async () => {
    mockFetch(() => ({ status: 401, json: { detail: 'expired' } }))
    await expect(
      new KitchenHubAdapter().refreshCredentials({ accessToken: 'old', refreshToken: 'dead' }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('has no OAuth authorize page', () => {
    expect(() => new KitchenHubAdapter().getAuthUrl('state')).toThrow(/no OAuth authorize page/)
  })
})
