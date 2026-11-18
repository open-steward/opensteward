import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { AssetPandaAdapter } from '../../../../../../src/verticals/inventory/adapters/asset-panda/index'
import { TOKEN_URL } from '../../../../../../src/verticals/inventory/adapters/asset-panda/constants'

/**
 * Asset Panda's v3 token page documents a body of the user's `email` and
 * `password` (https://team-asset-panda.readme.io/reference/post_v3-session-token.md).
 * The adapter used to collect and send a Client ID + Client Secret, which the
 * endpoint does not take, behind an `oauth2` label whose exchangeCode threw.
 */

afterEach(() => vi.restoreAllMocks())

const adapter = new AssetPandaAdapter({})

describe('asset-panda credential connection', () => {
  it('asks for the e-mail and password the token endpoint documents', () => {
    const names = adapter.credentialFields().map((f) => f.name)
    expect(names).toEqual(['email', 'password'])
    expect(adapter.credentialFields().find((f) => f.name === 'password')?.type).toBe('password')
  })

  it('posts email + password as JSON to /v3/session/token and keeps the returned token', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { token: 'tok-1' } } as never)

    const creds = await adapter.exchangeCredentials({ email: 'svc@example.com', password: 'pw' })

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, cfg] = post.mock.calls[0]!
    expect(url).toBe(TOKEN_URL)
    expect(url).toBe('https://api.assetpanda.com/v3/session/token')
    expect(body).toEqual({ email: 'svc@example.com', password: 'pw' })
    expect((cfg as { headers: Record<string, string> }).headers['Content-Type']).toBe(
      'application/json',
    )
    expect(creds.accessToken).toBe('tok-1')
  })

  it('rejects a connection missing the password without calling the API', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(adapter.exchangeCredentials({ email: 'svc@example.com' })).rejects.toThrow(
      /email \+ password/,
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('re-issues the token from the stored e-mail and password on refresh', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { token: 'tok-1' } } as never)
      .mockResolvedValueOnce({ data: { access_token: 'tok-2' } } as never)

    const first = await adapter.exchangeCredentials({ email: 'svc@example.com', password: 'pw' })
    const second = await adapter.refreshCredentials(first)

    expect(post.mock.calls[1]![1]).toEqual({ email: 'svc@example.com', password: 'pw' })
    expect(second.accessToken).toBe('tok-2')
  })

  it('offers no browser redirect flow', () => {
    expect(() => adapter.getAuthUrl('state')).toThrow(/e-mail \+ password/)
  })
})
