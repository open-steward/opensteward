/**
 * FastSpring Connect Link credential exchange tests.
 *
 * FastSpring auth is HTTP Basic with a merchant-generated API username +
 * password (https://developer.fastspring.com/reference/api-overview) — no
 * customer host to validate (the host is the fixed api.fastspring.com), so
 * these tests pin the form fields to what FastSpringClient reads.
 */
import { describe, it, expect } from 'vitest'
import { FastspringAdapter } from '../../../../../../src/verticals/ecommerce/adapters/fastspring/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

describe('FastSpring Connect Link form', () => {
  const adapter = new FastspringAdapter()
  // getAuthUrl/exchangeCode are real BaseAdapter methods (state, code +
  // redirectUri); FastSpring's concrete implementation ignores its
  // arguments and narrows them away, so calls below go through the
  // documented interface signature it implements.
  const oauth: EcommerceAdapter = adapter

  it('declares apiUsername and apiPassword, both required, password masked', () => {
    const fields = adapter.credentialFields!()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiPassword', 'apiUsername'])
    expect(byName['apiPassword']!.type).toBe('password')
    for (const f of fields) {
      expect(f.required).toBe(true)
      expect(f.helpText).toBeTruthy()
    }
  })

  it('rejects a blank apiUsername', async () => {
    await expect(
      adapter.exchangeCredentials!({ apiUsername: '  ', apiPassword: 'secret' }),
    ).rejects.toThrow(/required/)
  })

  it('rejects a blank apiPassword', async () => {
    await expect(
      adapter.exchangeCredentials!({ apiUsername: 'user', apiPassword: '  ' }),
    ).rejects.toThrow(/required/)
  })

  it('returns credentials in the shape FastSpringClient reads', async () => {
    const creds = await adapter.exchangeCredentials!({
      apiUsername: ' fs-user ',
      apiPassword: ' fs-pass ',
    })
    expect(creds).toEqual({
      accessToken: 'fs-user',
      extra: { apiUsername: 'fs-user', apiPassword: 'fs-pass' },
    })
  })

  it('exchangeCode throws instructing callers to use the credential form', async () => {
    await expect(oauth.exchangeCode('code', 'redirect')).rejects.toThrow(
      /does not use OAuth code exchange/,
    )
  })

  it('getAuthUrl returns an informational docs link, not a functional OAuth URL', () => {
    expect(oauth.getAuthUrl('state')).toMatch(/^https:\/\/developer\.fastspring\.com/)
  })

  it('refreshCredentials is a no-op (static API credentials never expire)', async () => {
    const creds = { accessToken: 'fs-user', extra: { apiUsername: 'fs-user', apiPassword: 'fs-pass' } }
    await expect(adapter.refreshCredentials(creds)).resolves.toEqual(creds)
  })
})
