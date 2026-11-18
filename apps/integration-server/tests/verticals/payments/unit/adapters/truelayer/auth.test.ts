/**
 * TrueLayer Payments API v3 token: "Option 3 to generate an `access_token`
 * for the Payments API v3." POST https://auth.truelayer.com/connect/token with
 * a JSON body whose ClientCredentialsGrantRequest requires `grant_type`
 * ("must be `client_credentials`"), `client_id`, `client_secret` and `scope`
 * (https://docs.truelayer.com/reference/generateaccesstoken).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { TrueLayerAdapter } from '../../../../../../src/verticals/payments/adapters/truelayer'

const post = vi.spyOn(axios, 'post')
const adapter = new TrueLayerAdapter()

beforeEach(() => {
  post.mockReset()
  post.mockRejectedValue(new Error('unexpected request'))
})

describe('truelayer auth', () => {
  it('mints a client-credentials token with the documented body', async () => {
    post.mockResolvedValue({
      data: { access_token: 'jwt', expires_in: 3600, token_type: 'Bearer', scope: 'payments' },
    })
    const creds = await adapter.exchangeCredentials({
      clientId: ' client ',
      clientSecret: 'secret',
      merchantAccountId: 'ma-1',
    })
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe('https://auth.truelayer.com/connect/token')
    expect(body).toEqual({
      grant_type: 'client_credentials',
      client_id: 'client',
      client_secret: 'secret',
      scope: 'payments',
    })
    expect(config?.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(creds.accessToken).toBe('jwt')
    expect(creds.extra).toEqual({
      clientId: 'client',
      clientSecret: 'secret',
      merchantAccountId: 'ma-1',
    })
    expect(creds.expiresAt).toBeInstanceOf(Date)
  })

  it('refreshes by minting again from the stored client credentials', async () => {
    post.mockResolvedValue({ data: { access_token: 'jwt2', expires_in: 3600 } })
    const creds = await adapter.refreshCredentials({
      accessToken: 'old',
      extra: { clientId: 'client', clientSecret: 'secret' },
    })
    expect(creds.accessToken).toBe('jwt2')
    expect(post.mock.calls[0]![1]).toMatchObject({ grant_type: 'client_credentials' })
  })

  it('requires both client fields and sends nothing without them', async () => {
    await expect(
      adapter.exchangeCredentials({ clientId: 'client', clientSecret: '' }),
    ).rejects.toThrow()
    expect(post).not.toHaveBeenCalled()
  })

  it('has no authorization-code flow', () => {
    expect(() => adapter.getAuthUrl()).toThrow(/client-credentials/)
  })
})
