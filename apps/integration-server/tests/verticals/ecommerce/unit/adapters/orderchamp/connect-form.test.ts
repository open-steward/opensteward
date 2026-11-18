/**
 * Orderchamp Connect Link form — private-app static token only.
 * Docs: https://developers.orderchamp.com/authentication
 */
import { describe, it, expect } from 'vitest'
import { CONNECT_FORM } from '../../../../../../src/verticals/ecommerce/adapters/orderchamp/connect-form'

describe('Orderchamp Connect Link form', () => {
  it('declares exactly the private app token field', () => {
    const fields = CONNECT_FORM.credentialFields()
    expect(fields).toHaveLength(1)
    expect(fields[0]!.name).toBe('accessToken')
    expect(fields[0]!.type).toBe('password')
    expect(fields[0]!.required).toBe(true)
  })

  it('rejects a blank token', async () => {
    await expect(CONNECT_FORM.exchangeCredentials({ accessToken: '   ' })).rejects.toThrow(
      /access token is required/,
    )
  })

  it('returns the trimmed token as accessToken, with no client secret (private apps have none)', async () => {
    const creds = await CONNECT_FORM.exchangeCredentials({ accessToken: '  tok_live_abc123 ' })
    expect(creds).toEqual({ accessToken: 'tok_live_abc123' })
  })
})
