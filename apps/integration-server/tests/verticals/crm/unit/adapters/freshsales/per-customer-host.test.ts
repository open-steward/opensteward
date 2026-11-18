/**
 * Freshsales serves each account at its own bundle alias —
 * `{domain}.myfreshworks.com/crm/sales/api` (legacy `{domain}.freshworks.com`)
 * or, on older accounts, `{domain}.freshsales.io/api`. The API key is sent to
 * that host on every request, so the domain must be collected per customer
 * and only a genuine Freshworks host may be accepted.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { FreshsalesAdapter } from '../../../../../../src/verticals/crm/adapters/freshsales'

afterEach(() => {
  vi.restoreAllMocks()
})

const VALID = { apiKey: 'fs_key', domain: 'acme' }

function mockFetch() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ contacts: [], meta: { total_pages: 1 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
}

describe('Freshsales Connect Link form', () => {
  const adapter = new FreshsalesAdapter()

  it('declares the API key and the domain the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'domain'])
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['domain']).toMatchObject({ type: 'text', required: true })
    expect(byName['domain']?.helpText).toMatch(/myfreshworks\.com/)
  })

  it('rejects a blank API key', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, apiKey: '' })).rejects.toThrow(
      /API key is required/,
    )
  })

  it('rejects a blank domain', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, domain: ' ' })).rejects.toThrow(
      /Freshsales domain is required/,
    )
  })

  it.each([
    'acme.myfreshworks.com.evil.example',
    'evil.example',
    'https://acme.myfreshworks.com@evil.example/',
    'deep.acme.myfreshworks.com',
    'acme.myfreshworks.com:8443',
    'myfreshworks.com',
  ])('rejects %s, which is not a Freshsales account host', async (domain) => {
    await expect(adapter.exchangeCredentials({ ...VALID, domain })).rejects.toThrow(
      /must be a myfreshworks\.com, freshworks\.com or freshsales\.io address/,
    )
  })

  it.each([
    ['acme', 'acme.myfreshworks.com', 'https://acme.myfreshworks.com/crm/sales/api'],
    ['https://ACME.myfreshworks.com/crm/sales/contacts/view/1', 'acme.myfreshworks.com', 'https://acme.myfreshworks.com/crm/sales/api'],
    ['acme.freshworks.com', 'acme.freshworks.com', 'https://acme.freshworks.com/crm/sales/api'],
    ['widgetz.freshsales.io', 'widgetz.freshsales.io', 'https://widgetz.freshsales.io/api'],
  ])('normalises %s', async (domain, host, baseUrl) => {
    const creds = await adapter.exchangeCredentials({ apiKey: ' fs_key ', domain })
    expect(creds).toEqual({ accessToken: 'fs_key', extra: { domain: host, baseUrl } })
  })
})

describe('Freshsales client host comes from the connection', () => {
  it('calls the API base stored on the credentials', async () => {
    const fetchSpy = mockFetch()
    const adapter = new FreshsalesAdapter()
    // getContact, not listContacts: listing contacts is refused before any request.
    await adapter
      .getContact(
        { accessToken: 'fs_key', extra: { domain: 'widgetz.freshsales.io', baseUrl: 'https://widgetz.freshsales.io/api' } },
        '1',
      )
      .catch(() => undefined)
    expect(fetchSpy).toHaveBeenCalled()
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(String(url)).toMatch(/^https:\/\/widgetz\.freshsales\.io\/api\//)
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Token token=fs_key')
  })

  it('refuses to build a request when the connection has no domain', async () => {
    const fetchSpy = mockFetch()
    const adapter = new FreshsalesAdapter()
    await expect(adapter.getContact({ accessToken: 'fs_key' }, '1')).rejects.toThrow(
      /missing its domain/,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
