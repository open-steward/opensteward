/**
 * Digits token requests are JSON.
 *
 * https://developer.digits.com/docs/authentication.md gives both grants as
 * "Request Headers: Content-Type: application/json" with a JSON body, and the
 * spec's POST /v1/oauth/token requestBody offers only application/json
 * (TokenRequest). The adapter used to post a form-encoded body.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  exchangeCode,
  refreshAccessToken,
} from '../../../../../../src/verticals/accounting/adapters/digits/auth'

const TOKEN = {
  access_token: 'new-at',
  refresh_token: 'new-rt',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'ledger:read',
}

afterEach(() => vi.restoreAllMocks())

describe('Digits token exchange', () => {
  it('exchanges the code with a JSON body', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await exchangeCode('the-code', 'cid', 'secret', 'https://app.example/cb')
    expect(creds.accessToken).toBe('new-at')
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://connect.digits.com/v1/oauth/token')
    expect(body).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      client_id: 'cid',
      client_secret: 'secret',
      redirect_uri: 'https://app.example/cb',
    })
    expect(body).not.toBeInstanceOf(URLSearchParams)
    expect(config?.headers?.['Content-Type']).toBe('application/json')
  })

  it('refreshes with a JSON body', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await refreshAccessToken('old-rt', 'cid', 'secret')
    expect(creds.refreshToken).toBe('new-rt')
    const [, body, config] = post.mock.calls[0]!
    expect(body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'old-rt',
      client_id: 'cid',
      client_secret: 'secret',
    })
    expect(body).not.toBeInstanceOf(URLSearchParams)
    expect(config?.headers?.['Content-Type']).toBe('application/json')
  })
})
