/**
 * The client-credentials grant Birdview documents
 * (https://help.birdviewpsa.com/hc/en-us/articles/38116720932749):
 *   "POST [host]/OAuth2/token
 *    Content-Type: application/x-www-form-urlencoded
 *    grant_type=client_credentials&client_id=[clientID]&scope=user:[user]&client_secret=[clientSecret]"
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BirdviewAdapter } from '../../../../../../src/verticals/projects/adapters/birdview/index'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown = { access_token: 'at', expires_in: 3600 }) {
  const calls: Array<{ url: string; body: URLSearchParams; headers: Record<string, string> }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        body: new URLSearchParams(String(init.body)),
        headers: init.headers as Record<string, string>,
      })
      return new Response(JSON.stringify(body), { status: 200 })
    }),
  )
  return calls
}

const adapter = new BirdviewAdapter()

describe('birdview auth', () => {
  it('asks for account, client id/secret and the user id', () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual([
      'clientId',
      'clientSecret',
      'account',
      'userId',
    ])
  })

  it('exchangeCredentials sends scope=user:<id> to the tenant token URL', async () => {
    const calls = stubFetch()
    const c = await adapter.exchangeCredentials({
      account: 'acme',
      clientId: 'cid',
      clientSecret: 'sec',
      userId: '7',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://acme.go.easyprojects.net/OAuth2/token')
    expect(calls[0]!.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(calls[0]!.body)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'cid',
      scope: 'user:7',
      client_secret: 'sec',
    })
    expect(c.accessToken).toBe('at')
    expect(c.extra).toEqual({ account: 'acme', clientId: 'cid', clientSecret: 'sec', userId: '7' })
  })

  it('stores expiresAt as now + expires_in seconds', async () => {
    stubFetch()
    const before = Date.now()
    const c = await adapter.exchangeCredentials({
      account: 'acme',
      clientId: 'cid',
      clientSecret: 'sec',
      userId: '7',
    })
    const at = (c.expiresAt as Date).getTime()
    expect(at).toBeGreaterThanOrEqual(before + 3_600_000)
    expect(at).toBeLessThanOrEqual(Date.now() + 3_600_000)
  })

  it('rejects a token response without access_token', async () => {
    stubFetch({ token_type: 'bearer' })
    await expect(
      adapter.exchangeCredentials({
        account: 'acme',
        clientId: 'c',
        clientSecret: 's',
        userId: '7',
      }),
    ).rejects.toThrow(/no access_token/)
  })

  it.each(['account', 'clientId', 'clientSecret', 'userId'])(
    'refuses a form without %s, before any request',
    async (missing) => {
      const calls = stubFetch()
      const form: Record<string, string> = {
        account: 'acme',
        clientId: 'c',
        clientSecret: 's',
        userId: '7',
      }
      form[missing] = ''
      await expect(adapter.exchangeCredentials(form)).rejects.toThrow(/is required/)
      expect(calls).toHaveLength(0)
    },
  )

  it('refuses an account slug that is not one subdomain label, before any request', async () => {
    const calls = stubFetch()
    await expect(
      adapter.exchangeCredentials({
        account: 'evil.example#',
        clientId: 'c',
        clientSecret: 's',
        userId: '7',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ACCOUNT' })
    expect(calls).toHaveLength(0)
  })

  it('refuses a user id that is not numeric, before any request', async () => {
    const calls = stubFetch()
    await expect(
      adapter.exchangeCredentials({
        account: 'acme',
        clientId: 'c',
        clientSecret: 's',
        userId: 'a@b.c',
      }),
    ).rejects.toThrow(/numeric/)
    expect(calls).toHaveLength(0)
  })

  it('refreshCredentials re-runs the grant with the stored user id', async () => {
    const calls = stubFetch()
    await adapter.refreshCredentials({
      accessToken: 'old',
      extra: { account: 'acme', clientId: 'cid', clientSecret: 'sec', userId: '9' },
    })
    expect(calls[0]!.body.get('scope')).toBe('user:9')
  })

  it('refreshCredentials leaves a connection without a user id unchanged', async () => {
    const calls = stubFetch()
    const old = {
      accessToken: 'old',
      extra: { account: 'acme', clientId: 'cid', clientSecret: 'sec' },
    }
    expect(await adapter.refreshCredentials(old)).toBe(old)
    expect(calls).toHaveLength(0)
  })
})
