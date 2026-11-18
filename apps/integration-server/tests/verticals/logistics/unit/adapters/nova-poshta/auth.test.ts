/**
 * Nova Poshta JWT exchange. First-party spec
 * (https://api-portal.novapost.com/methods/methods/authorization.md):
 *   GET /clients/authorization?apiKey={apiKey}
 *   200 "JWT-token": { jwt: "Personal JWT-token, expires after one hour …" }
 * The adapter read `token ?? accessToken`, neither of which the response
 * carries, so every exchange threw.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  exchangeApiKey,
  refreshCredentials,
} from '../../../../../../src/verticals/logistics/adapters/nova-poshta/auth'

afterEach(() => vi.restoreAllMocks())

function fakeAuth(body: unknown) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }))
}

describe('nova-poshta JWT exchange (GET /clients/authorization)', () => {
  it('reads the documented `jwt` field and keeps the api key for re-exchange', async () => {
    const fetch = fakeAuth({ jwt: 'eyJ.documented.jwt' })
    const creds = await exchangeApiKey('np key/1')
    expect(creds.accessToken).toBe('eyJ.documented.jwt')
    expect(creds.refreshToken).toBe('np key/1')
    expect(String(fetch.mock.calls[0]![0])).toBe(
      'https://api.novapost.com/v.1.0/clients/authorization?apiKey=np%20key%2F1',
    )
  })

  it('refresh re-exchanges the stored api key', async () => {
    fakeAuth({ jwt: 'eyJ.fresh' })
    const creds = await refreshCredentials({ accessToken: 'old', refreshToken: 'k' })
    expect(creds.accessToken).toBe('eyJ.fresh')
  })

  it('throws when the response has no `jwt`', async () => {
    fakeAuth({ token: 'not-the-documented-field' })
    await expect(exchangeApiKey('k')).rejects.toThrow(/jwt/)
  })
})
