/**
 * KORONA is a multi-tenant cloud API reachable through one of several
 * cluster nodes (`servers[0].url` on
 * https://128.koronacloud.com/web/api/v3/openapi.json uses `128` as its own
 * example node), so the host is per-customer and receives Basic-auth
 * credentials on every request. Confined to a `*.koronacloud.com` suffix —
 * the documented vendor domain — rather than `assertPublicHost`, mirroring
 * VTEX's account-name confinement (`parseVtexAccount`).
 */
import { describe, expect, it } from 'vitest'
import { KoronaPosAdapter } from '../../../../../../src/verticals/ecommerce/adapters/korona-pos/index'

const VALID = {
  host: '128.koronacloud.com',
  koronaAccountId: 'acct-123',
  username: 'api-user',
  password: 'api-secret',
}

describe('KORONA POS Connect Link form — per-customer cloud host', () => {
  it('declares exactly the four values the client reads', () => {
    const adapter = new KoronaPosAdapter()
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['host', 'koronaAccountId', 'password', 'username'])
    expect(byName['password']!.type).toBe('password')
    for (const f of fields) {
      expect(f.required).toBe(true)
      expect(f.helpText).toBeTruthy()
    }
  })

  it('rejects a blank host', async () => {
    const adapter = new KoronaPosAdapter()
    await expect(adapter.exchangeCredentials({ ...VALID, host: '   ' })).rejects.toThrow(
      /KORONA cloud host is required/,
    )
  })

  it('rejects a blank koronaAccountId, username, or password', async () => {
    const adapter = new KoronaPosAdapter()
    await expect(adapter.exchangeCredentials({ ...VALID, koronaAccountId: '' })).rejects.toThrow(
      /KORONA account ID is required/,
    )
    await expect(adapter.exchangeCredentials({ ...VALID, username: '' })).rejects.toThrow(
      /API username is required/,
    )
    await expect(adapter.exchangeCredentials({ ...VALID, password: '' })).rejects.toThrow(
      /API password is required/,
    )
  })

  it('rejects a host outside the koronacloud.com suffix', async () => {
    const adapter = new KoronaPosAdapter()
    await expect(
      adapter.exchangeCredentials({ ...VALID, host: '128.koronacloud.com.evil.example' }),
    ).rejects.toThrow(/is not a KORONA cloud host/)
    await expect(adapter.exchangeCredentials({ ...VALID, host: 'evil.example' })).rejects.toThrow(
      /is not a KORONA cloud host/,
    )
  })

  it('rejects a host URL carrying a username or password', async () => {
    const adapter = new KoronaPosAdapter()
    await expect(
      adapter.exchangeCredentials({ ...VALID, host: 'https://user:pw@128.koronacloud.com' }),
    ).rejects.toThrow(/is not a KORONA cloud host/)
  })

  it('accepts a pasted https URL and reduces it to the bare host', async () => {
    const adapter = new KoronaPosAdapter()
    const creds = await adapter.exchangeCredentials({ ...VALID, host: 'https://128.koronacloud.com/web/' })
    expect(creds.extra?.['host']).toBe('128.koronacloud.com')
  })

  it('returns normalised values in the shape the client reads', async () => {
    const adapter = new KoronaPosAdapter()
    const creds = await adapter.exchangeCredentials({
      host: ' 128.KoronaCloud.com ',
      koronaAccountId: ' acct-123 ',
      username: ' api-user ',
      password: ' api-secret ',
    })
    expect(creds).toEqual({
      accessToken: 'api-user',
      extra: { host: '128.koronacloud.com', koronaAccountId: 'acct-123', username: 'api-user', password: 'api-secret' },
    })
  })

  it('builds the client base URL and Basic auth header from those credentials', async () => {
    const adapter = new KoronaPosAdapter()
    const creds = await adapter.exchangeCredentials(VALID)
    const client = adapter['client'](creds)
    const defaults = client['http'].defaults
    expect(defaults.baseURL).toBe('https://128.koronacloud.com/web/api/v3/accounts/acct-123')
    const expected = Buffer.from('api-user:api-secret').toString('base64')
    expect(defaults.headers['Authorization']).toBe(`Basic ${expected}`)
  })
})
