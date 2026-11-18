import { describe, it, expect } from 'vitest'
import { hasFortnoxTokens, getCredentials, getAdapter } from './setup'

describe.skipIf(!hasFortnoxTokens)('Fortnox Integration: Connection', () => {
  it('loads and refreshes credentials successfully', async () => {
    const creds = await getCredentials()
    expect(creds.accessToken).toBeTruthy()
    expect(creds.refreshToken).toBeTruthy()
  })

  it('adapter can refresh credentials', async () => {
    const adapter = getAdapter()
    const creds = await getCredentials()
    const refreshed = await adapter.refreshCredentials(creds)
    expect(refreshed.accessToken).toBeTruthy()
    expect(refreshed.accessToken).not.toBe(creds.accessToken)
  })
})
