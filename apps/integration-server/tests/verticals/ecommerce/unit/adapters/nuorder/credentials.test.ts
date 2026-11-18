// NuORDER Connect Link credential form: four static OAuth 1.0a values +
// environment, generated in Brand Admin -> Settings -> API Management.
// https://assets.nuorder.com/api-docs/index.html
import { describe, it, expect } from 'vitest'
import { NuorderAdapter } from '../../../../../../src/verticals/ecommerce/adapters/nuorder/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

describe('NuorderAdapter credential exchange', () => {
  const adapter = new NuorderAdapter()
  // getAuthUrl/exchangeCode are real BaseAdapter methods (state, code +
  // redirectUri); NuORDER's concrete implementation ignores its arguments
  // and narrows them away, so calls below go through the documented
  // interface signature it implements.
  const oauth: EcommerceAdapter = adapter

  it('declares the four OAuth 1.0a fields plus environment, secrets as password', () => {
    const fields = adapter.credentialFields!()
    expect(fields.map((f) => f.name)).toEqual([
      'consumerKey',
      'consumerSecret',
      'token',
      'tokenSecret',
      'environment',
    ])
    expect(fields.find((f) => f.name === 'consumerSecret')?.type).toBe('password')
    expect(fields.find((f) => f.name === 'tokenSecret')?.type).toBe('password')
    expect(fields.find((f) => f.name === 'consumerKey')?.type).toBe('text')
    const env = fields.find((f) => f.name === 'environment')!
    expect(env.type).toBe('select')
    expect(env.options?.map((o) => o.value).sort()).toEqual(['next', 'production', 'sandbox1'])
  })

  it('exchanges all four values plus environment into Credentials', async () => {
    const creds = await adapter.exchangeCredentials!({
      consumerKey: 'ck1',
      consumerSecret: 'cs1',
      token: 'tok1',
      tokenSecret: 'ts1',
      environment: 'sandbox1',
    })
    expect(creds.accessToken).toBe('tok1')
    expect(creds.extra).toEqual({
      consumerKey: 'ck1',
      consumerSecret: 'cs1',
      token: 'tok1',
      tokenSecret: 'ts1',
      environment: 'sandbox1',
    })
  })

  it('rejects a missing consumerSecret', async () => {
    await expect(
      adapter.exchangeCredentials!({ consumerKey: 'ck1', token: 'tok1', tokenSecret: 'ts1', environment: 'production' }),
    ).rejects.toThrow()
  })

  it('rejects an unknown environment', async () => {
    await expect(
      adapter.exchangeCredentials!({
        consumerKey: 'ck1',
        consumerSecret: 'cs1',
        token: 'tok1',
        tokenSecret: 'ts1',
        environment: 'staging-typo',
      }),
    ).rejects.toThrow(/environment/i)
  })

  it('getAuthUrl/exchangeCode are non-functional (no OAuth2 flow) and say so', async () => {
    expect(oauth.getAuthUrl('state')).toMatch(/nuorder\.com/)
    await expect(oauth.exchangeCode('code', 'redirect')).rejects.toThrow(/OAuth 1\.0a/)
  })
})
