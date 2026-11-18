// Nacelle Connect Link credential form. Docs:
//   https://docs.nacelle.com/docs/auth-storefront
//   https://docs.nacelle.com/docs/auth-credentials
import { describe, it, expect } from 'vitest'
import { NacelleAdapter } from '../../../../../../src/verticals/ecommerce/adapters/nacelle/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

describe('NacelleAdapter credential exchange', () => {
  const adapter = new NacelleAdapter()
  // getAuthUrl/exchangeCode are real BaseAdapter methods (state, code +
  // redirectUri); Nacelle's concrete implementation ignores its arguments
  // and narrows them away, so calls below go through the documented
  // interface signature it implements.
  const oauth: EcommerceAdapter = adapter

  it('declares spaceId + accessToken fields, secrets as password', () => {
    const fields = adapter.credentialFields!()
    expect(fields.map((f) => f.name)).toEqual(['spaceId', 'accessToken'])
    expect(fields.find((f) => f.name === 'accessToken')?.type).toBe('password')
    expect(fields.find((f) => f.name === 'spaceId')?.type).toBe('text')
  })

  it('exchanges spaceId + accessToken into Credentials with spaceId in extra', async () => {
    const creds = await adapter.exchangeCredentials!({
      spaceId: 'space_123',
      accessToken: 'pat_abcdef',
    })
    expect(creds.accessToken).toBe('pat_abcdef')
    expect(creds.extra).toEqual({ spaceId: 'space_123' })
  })

  it('rejects a missing spaceId', async () => {
    await expect(adapter.exchangeCredentials!({ accessToken: 'pat_abcdef' })).rejects.toThrow()
  })

  it('rejects a missing accessToken', async () => {
    await expect(adapter.exchangeCredentials!({ spaceId: 'space_123' })).rejects.toThrow()
  })

  it('getAuthUrl/exchangeCode are non-functional (no OAuth flow) and say so', async () => {
    expect(oauth.getAuthUrl('state')).toMatch(/nacelle\.com/)
    await expect(oauth.exchangeCode('code', 'redirect')).rejects.toThrow(/Private Access Token/)
  })
})
