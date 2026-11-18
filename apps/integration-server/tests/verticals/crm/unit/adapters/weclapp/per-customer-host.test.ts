/**
 * weclapp serves each tenant at `{tenant}.weclapp.com/webapp/api/v1`, and the
 * API token is sent to that host on every request. The tenant is per customer,
 * so the Connect Link form must collect it, only a genuine weclapp.com tenant
 * may be accepted, and the client must never fall back to a demo tenant.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { WeclappAdapter } from '../../../../../../src/verticals/crm/adapters/weclapp'

afterEach(() => {
  vi.restoreAllMocks()
})

const VALID = { apiKey: 'wc_token', tenant: 'acme' }

function mockFetch() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
}

describe('weclapp Connect Link form', () => {
  const adapter = new WeclappAdapter()

  it('declares the API token and the tenant the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'tenant'])
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['tenant']).toMatchObject({ type: 'text', required: true })
    expect(byName['tenant']?.helpText).toMatch(/weclapp\.com/)
  })

  it('rejects a blank API token', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, apiKey: '' })).rejects.toThrow(
      /API token is required/,
    )
  })

  it('rejects a blank tenant', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, tenant: '' })).rejects.toThrow(
      /weclapp tenant is required/,
    )
  })

  it.each([
    'acme.weclapp.com.evil.example',
    'evil.example',
    'https://acme.weclapp.com@evil.example/',
    'deep.acme.weclapp.com',
    'acme.weclapp.com:8443',
    'weclapp.com',
  ])('rejects %s, which is not a weclapp.com tenant', async (tenant) => {
    await expect(adapter.exchangeCredentials({ ...VALID, tenant })).rejects.toThrow(
      /is not a weclapp\.com tenant/,
    )
  })

  it.each(['acme', 'ACME.weclapp.com', 'https://acme.weclapp.com/webapp/view/party/customer'])(
    'normalises %s to the tenant API base',
    async (tenant) => {
      const creds = await adapter.exchangeCredentials({ apiKey: ' wc_token ', tenant })
      expect(creds).toEqual({
        accessToken: 'wc_token',
        extra: { instanceUrl: 'https://acme.weclapp.com/webapp/api/v1' },
      })
    },
  )
})

describe('weclapp client host comes from the connection', () => {
  it('calls the tenant stored on the credentials', async () => {
    const fetchSpy = mockFetch()
    const adapter = new WeclappAdapter()
    await adapter
      .listContacts(
        { accessToken: 'wc_token', extra: { instanceUrl: 'https://acme.weclapp.com/webapp/api/v1' } },
        {},
      )
      .catch(() => undefined)
    expect(fetchSpy).toHaveBeenCalled()
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(String(url)).toMatch(/^https:\/\/acme\.weclapp\.com\/webapp\/api\/v1\//)
    expect((init?.headers as Record<string, string>)['AuthenticationToken']).toBe('wc_token')
  })

  it('refuses to call a demo tenant when the connection has no tenant URL', async () => {
    const fetchSpy = mockFetch()
    const adapter = new WeclappAdapter()
    await expect(adapter.listContacts({ accessToken: 'wc_token' }, {})).rejects.toThrow(
      /missing its tenant URL/,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
