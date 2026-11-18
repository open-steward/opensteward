/**
 * Wayfair supplier application keys — pinned against
 * https://developer.wayfair.io/posts/api-access-tokens: POST JSON
 * { grant_type: client_credentials, client_id, client_secret } plus the
 * environment's audience to https://sso.auth.wayfair.com/oauth/token.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { WayfairAdapter } from '../../../../../../src/verticals/ecommerce/adapters/wayfair'

afterEach(() => vi.restoreAllMocks())

describe('WayfairAdapter credential form', () => {
  it('asks for the application Client ID and Client Secret', () => {
    expect(new WayfairAdapter().credentialFields().map((f) => f.name)).toEqual([
      'clientId',
      'clientSecret',
    ])
  })

  it('exchanges them for a token and keeps them for refresh', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'at-1', token_type: 'Bearer', expires_in: 86400 },
    } as never)

    const creds = await new WayfairAdapter().exchangeCredentials({
      clientId: ' cid ',
      clientSecret: 'sec',
    })

    const [url, body] = post.mock.calls[0] as [string, Record<string, string>]
    expect(url).toBe('https://sso.auth.wayfair.com/oauth/token')
    expect(body).toEqual({
      grant_type: 'client_credentials',
      client_id: 'cid',
      client_secret: 'sec',
      audience: 'https://api.wayfair.com/',
    })
    expect(creds.accessToken).toBe('at-1')
    expect(creds.expiresAt).toBeInstanceOf(Date)
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'sec' })
  })

  it('uses the sandbox audience on a sandbox deployment', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'at-1', token_type: 'Bearer', expires_in: 86400 },
    } as never)
    await new WayfairAdapter({ sandbox: true }).exchangeCredentials({
      clientId: 'c',
      clientSecret: 's',
    })
    expect((post.mock.calls[0]![1] as Record<string, string>)['audience']).toBe(
      'https://sandbox.api.wayfair.com/',
    )
  })

  it('rejects an empty form without calling Wayfair', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      new WayfairAdapter().exchangeCredentials({ clientId: '', clientSecret: '' }),
    ).rejects.toThrow(/required/)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('WayfairAdapter.refreshCredentials', () => {
  it('re-runs the grant from credentials.extra and keeps extra on the result', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'at-2', token_type: 'Bearer', expires_in: 86400 },
    } as never)
    const extra = { clientId: 'cid', clientSecret: 'sec' }

    const creds = await new WayfairAdapter().refreshCredentials({ accessToken: 'at-1', extra })

    expect((post.mock.calls[0]![1] as Record<string, string>)['client_id']).toBe('cid')
    expect(creds.accessToken).toBe('at-2')
    expect(creds.extra).toEqual(extra)
  })

  it('fails loudly with no client credentials anywhere', async () => {
    await expect(new WayfairAdapter().refreshCredentials({ accessToken: '' })).rejects.toThrow(
      /clientId/,
    )
  })
})
