/**
 * VTEX hosts every store at `https://{account}.{environment}.com.br`, and the
 * client needs the account name, the X-VTEX-API-AppKey and the
 * X-VTEX-API-AppToken. The Connect Link form used to collect only a single
 * `apiKey`, so the client threw on the missing appKey / accountName for every
 * linked connection. The account name ends up in the hostname that receives
 * the app token, so it must not be able to steer the request off VTEX.
 */
import { describe, expect, it } from 'vitest'
import { VtexAdapter } from '../../../../../../src/verticals/ecommerce/adapters/vtex/index'
import type { VtexClient } from '../../../../../../src/verticals/ecommerce/adapters/vtex/client'

const VALID = {
  accountName: 'mystore',
  appKey: 'vtexappkey-mystore-ABCDEF',
  appToken: 'SECRETTOKENVALUE',
}

describe('VTEX Connect Link form — per-customer account host', () => {
  const adapter = new VtexAdapter()

  it('declares every value the client reads, with the app token masked', () => {
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['accountName', 'appKey', 'appToken'])
    expect(byName['appToken']!.type).toBe('password')
    for (const f of fields) {
      expect(f.required).toBe(true)
      expect(f.helpText).toBeTruthy()
    }
  })

  it.each([
    ['accountName', /VTEX account name is required/],
    ['appKey', /App key is required/],
    ['appToken', /App token is required/],
  ])('rejects a blank %s', async (field, message) => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, [field]: ' ' }),
    ).rejects.toThrow(message)
  })

  it.each([
    'mystore.vtexcommercestable.com.br.evil.example',
    'https://evil.example/mystore.vtexcommercestable.com.br',
    'mystore.evil.example',
    'https://mystore.vtexcommercestable.com.br@evil.example',
  ])('rejects a host outside VTEX: %s', async (accountName) => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, accountName }),
    ).rejects.toThrow(/is not a VTEX store address/)
  })

  it.each(['my store', 'mystore/../x', 'ftp://mystore.myvtex.com'])(
    'rejects a malformed account name: %s',
    async (accountName) => {
      await expect(
        adapter.exchangeCredentials({ ...VALID, accountName }),
      ).rejects.toThrow(/is not a VTEX store address/)
    },
  )

  it.each([
    ['mystore', 'vtexcommercestable'],
    ['MyStore', 'vtexcommercestable'],
    ['mystore.vtexcommercestable.com.br', 'vtexcommercestable'],
    ['https://mystore.vtexcommercestable.com.br/api/oms', 'vtexcommercestable'],
    ['https://mystore.myvtex.com/admin', 'vtexcommercestable'],
    ['https://workspace--mystore.myvtex.com/', 'vtexcommercestable'],
    ['mystore.vtexcommercebeta.com.br', 'vtexcommercebeta'],
  ])('normalises %s to the account name', async (accountName, environment) => {
    const creds = await adapter.exchangeCredentials({
      accountName,
      appKey: ` ${VALID.appKey} `,
      appToken: ` ${VALID.appToken}`,
    })
    expect(creds).toEqual({
      accessToken: VALID.appToken,
      extra: { accountName: 'mystore', appKey: VALID.appKey, environment },
    })
  })

  it('builds the client base URL and auth headers from those credentials', async () => {
    const creds = await adapter.exchangeCredentials(VALID)
    const client: VtexClient = adapter['clientFor'](creds)
    expect(client.baseUrl).toBe('https://mystore.vtexcommercestable.com.br')
    const headers = client['http'].defaults.headers
    expect(headers['X-VTEX-API-AppKey']).toBe(VALID.appKey)
    expect(headers['X-VTEX-API-AppToken']).toBe(VALID.appToken)
  })
})
