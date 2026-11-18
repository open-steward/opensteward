/**
 * CloudSign auth — a per-connection client ID exchanged for a one-hour token.
 *
 * The Web API spec (https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0)
 * documents exactly one way in: `POST /token`, form-encoded, one required
 * field, `client_id`. There is no authorize endpoint, no code, no client
 * secret and no refresh token. The usage guide
 * (https://help.cloudsign.jp/ja/articles/2681259) gives the URL
 * `https://api.cloudsign.jp/token` and the header
 * `Authorization: Bearer <access_token>`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { inspect } from 'node:util'
import { CloudSignAdapter } from '../../../../../../src/verticals/docsign/adapters/cloudsign'
import { CloudSignClient } from '../../../../../../src/verticals/docsign/adapters/cloudsign/client'
import { refreshStatusForError, type Credentials } from '@opensteward/shared'

const TOKEN_REPLY = {
  access_token: '4c59ab2e-b34b-4985-893a-afce2b07f503',
  expires_in: 3600,
  token_type: 'Bearer',
}

function fakeTokenEndpoint(reply: unknown = TOKEN_REPLY) {
  return vi.spyOn(axios, 'post').mockResolvedValue({ data: reply } as never)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('CloudSign credential form', () => {
  it('asks for the client ID and nothing else', () => {
    const fields = new CloudSignAdapter().credentialFields()
    expect(fields.map((f) => f.name)).toEqual(['clientId'])
    expect(fields[0]).toMatchObject({ type: 'password', required: true })
  })
})

describe('CloudSign exchangeCredentials', () => {
  it('POSTs client_id form-encoded to https://api.cloudsign.jp/token', async () => {
    const post = fakeTokenEndpoint()

    await new CloudSignAdapter().exchangeCredentials({ clientId: 'cid-123' })

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://api.cloudsign.jp/token')
    expect(body).toBe('client_id=cid-123')
    expect((config as { headers: Record<string, string> }).headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    })
  })

  it('sends no OAuth grant fields — no grant_type, code, client_secret or redirect_uri', async () => {
    const post = fakeTokenEndpoint()

    await new CloudSignAdapter().exchangeCredentials({ clientId: 'cid-123' })

    const sent = new URLSearchParams(post.mock.calls[0]![1] as string)
    expect([...sent.keys()]).toEqual(['client_id'])
  })

  it('stores the access token, expires it by expires_in and keeps the client ID to re-mint', async () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
    fakeTokenEndpoint({ ...TOKEN_REPLY, expires_in: 1200 })

    const creds = await new CloudSignAdapter().exchangeCredentials({ clientId: 'cid-123' })

    expect(creds.accessToken).toBe(TOKEN_REPLY.access_token)
    expect(creds.expiresAt).toEqual(new Date('2026-01-01T00:20:00Z'))
    expect(creds.refreshToken).toBeUndefined()
    expect(creds.extra).toEqual({ clientId: 'cid-123' })
  })

  it('trims the pasted client ID', async () => {
    const post = fakeTokenEndpoint()

    await new CloudSignAdapter().exchangeCredentials({ clientId: '  cid-123 \n' })

    expect(post.mock.calls[0]![1]).toBe('client_id=cid-123')
  })

  it('stores the trimmed client ID, not the pasted one, for re-minting', async () => {
    fakeTokenEndpoint()

    const creds = await new CloudSignAdapter().exchangeCredentials({ clientId: '  cid-123 \n' })

    expect(creds.extra).toEqual({ clientId: 'cid-123' })
  })

  it('refuses a blank client ID without calling CloudSign', async () => {
    const post = fakeTokenEndpoint()

    await expect(new CloudSignAdapter().exchangeCredentials({ clientId: '  ' })).rejects.toThrow(
      /client ID/i,
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a token reply with no access_token', async () => {
    fakeTokenEndpoint({ expires_in: 3600, token_type: 'Bearer' })

    await expect(
      new CloudSignAdapter().exchangeCredentials({ clientId: 'cid-123' }),
    ).rejects.toThrow()
  })

  it('rejects a token reply whose access_token is empty', async () => {
    fakeTokenEndpoint({ ...TOKEN_REPLY, access_token: '' })

    await expect(
      new CloudSignAdapter().exchangeCredentials({ clientId: 'cid-123' }),
    ).rejects.toThrow()
  })

  it.each([-1, 1.5])('rejects a token reply whose expires_in is %s', async (expiresIn) => {
    fakeTokenEndpoint({ ...TOKEN_REPLY, expires_in: expiresIn })

    await expect(
      new CloudSignAdapter().exchangeCredentials({ clientId: 'cid-123' }),
    ).rejects.toThrow()
  })

  it('rejects a token reply with no expires_in', async () => {
    fakeTokenEndpoint({ access_token: TOKEN_REPLY.access_token, token_type: 'Bearer' })

    await expect(
      new CloudSignAdapter().exchangeCredentials({ clientId: 'cid-123' }),
    ).rejects.toThrow()
  })
})

describe('CloudSign refreshCredentials', () => {
  const stored: Credentials = {
    accessToken: 'old-token',
    expiresAt: new Date('2025-12-31T23:00:00Z'),
    extra: { clientId: 'cid-123' },
  }

  it('re-mints a token from the stored client ID', async () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
    const post = fakeTokenEndpoint({
      ...TOKEN_REPLY,
      access_token: 'new-token-0000000000000000000000000',
    })

    const fresh = await new CloudSignAdapter().refreshCredentials(stored)

    const [url, body] = post.mock.calls[0]!
    expect(url).toBe('https://api.cloudsign.jp/token')
    expect(body).toBe('client_id=cid-123')
    expect(fresh.accessToken).toBe('new-token-0000000000000000000000000')
    expect(fresh.expiresAt).toEqual(new Date('2026-01-01T01:00:00Z'))
    expect(fresh.extra).toEqual({ clientId: 'cid-123' })
  })

  it('keeps every other stored field when it swaps in the new token', async () => {
    fakeTokenEndpoint()

    const fresh = await new CloudSignAdapter().refreshCredentials({
      ...stored,
      webhookSecret: 'whsec-1',
      extra: { clientId: 'cid-123', note: 'kept' },
    })

    expect(fresh.webhookSecret).toBe('whsec-1')
    expect(fresh.extra).toEqual({ clientId: 'cid-123', note: 'kept' })
  })

  it('fails loudly when the connection holds no client ID instead of returning the stale token', async () => {
    const post = fakeTokenEndpoint()

    await expect(
      new CloudSignAdapter().refreshCredentials({ accessToken: 'old-token', extra: {} }),
    ).rejects.toThrow(/client ID/i)
    expect(post).not.toHaveBeenCalled()
  })
})

/**
 * `POST /token` error replies, from the spec's responses for that path:
 * 400 "client_id が空の場合、 error の値は invalid_request … 不適切な client_id の
 * 場合、 error の値は invalid_client"; 403 "error の値は forbidden … 無効なユーザーの
 * クライアント ID を使用したリクエストの場合 / IPアドレス制限機能を設定していて、
 * 不正なIPアドレスからリクエストした場合"; 500 "internal_server_error".
 *
 * The client ID belongs to the connection, so a rejected one is that
 * connection's problem ('expired', reconnect), never the operator-wide
 * 'platform_error' that a bare `invalid_client` code classifies as.
 */
function tokenEndpointRejects(status: number, error: string) {
  const err = Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { error, message: 'rejected' } },
    config: { data: 'client_id=cid-123' },
  })
  return vi.spyOn(axios, 'post').mockRejectedValue(err)
}

async function refreshError(stored: Credentials): Promise<unknown> {
  try {
    await new CloudSignAdapter().refreshCredentials(stored)
  } catch (err) {
    return err
  }
  throw new Error('refreshCredentials resolved')
}

describe('CloudSign refresh failures reach the right connection status', () => {
  const stored: Credentials = { accessToken: 'old-token', extra: { clientId: 'cid-123' } }

  it.each([
    [400, 'invalid_client'],
    [400, 'invalid_request'],
    [403, 'forbidden'],
  ])(
    'a %s %s from /token marks the connection expired, not platform_error',
    async (status, code) => {
      tokenEndpointRejects(status, code)

      expect(refreshStatusForError(await refreshError(stored))).toBe('expired')
    },
  )

  it('a connection with no stored client ID is expired (it must reconnect), not retried forever', async () => {
    expect(refreshStatusForError(await refreshError({ accessToken: 'old-token', extra: {} }))).toBe(
      'expired',
    )
  })

  it('a 500 from /token stays a retryable failure', async () => {
    tokenEndpointRejects(500, 'internal_server_error')

    expect(refreshStatusForError(await refreshError(stored))).toBe('failed')
  })

  it('does not carry the request (and its client_id) on the rethrown error', async () => {
    tokenEndpointRejects(403, 'forbidden')

    const err = await refreshError(stored)
    expect(inspect(err, { depth: 10, showHidden: true })).not.toContain('cid-123')
  })
})

describe('CloudSign has no OAuth redirect', () => {
  it('getAuthUrl throws rather than building a URL to an endpoint CloudSign does not have', () => {
    expect(() => new CloudSignAdapter().getAuthUrl('state')).toThrow(/credentialFields/)
  })

  it('exchangeCode throws', async () => {
    await expect(new CloudSignAdapter().exchangeCode('code', 'https://x')).rejects.toThrow(
      /credentialFields/,
    )
  })
})

describe('CloudSignClient auth header', () => {
  it('sends Authorization: Bearer <token> to https://api.cloudsign.jp', () => {
    const create = vi.spyOn(axios, 'create').mockReturnValue({} as never)

    new CloudSignClient({ accessToken: 'tok-1' } as Credentials)

    const config = create.mock.calls[0]![0]!
    expect(config.baseURL).toBe('https://api.cloudsign.jp')
    expect(config.headers).toMatchObject({ Authorization: 'Bearer tok-1' })
  })
})
