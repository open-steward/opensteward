/**
 * Maxio Advanced Billing serves every site at `{subdomain}.chargify.com`, and
 * the API key is sent (HTTP Basic) to that host on every request. The
 * subdomain is per customer, so the Connect Link form must collect it, and
 * only a genuine chargify.com site may be accepted.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import axios from 'axios'
import { MaxioAdapter } from '../../../../../../src/verticals/accounting/adapters/maxio'

afterEach(() => {
  vi.restoreAllMocks()
})

const VALID = { apiKey: 'key_abc', subdomain: 'acme' }

describe('Maxio Connect Link form', () => {
  const adapter = new MaxioAdapter({ apiKey: '' })

  it('declares the API key and the site subdomain the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'subdomain'])
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['subdomain']).toMatchObject({ type: 'text', required: true })
    expect(byName['subdomain']?.helpText).toMatch(/chargify\.com/)
  })

  it('rejects a blank API key', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, apiKey: '' })).rejects.toThrow(
      /API key is required/,
    )
  })

  it('rejects a blank subdomain', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, subdomain: ' ' })).rejects.toThrow(
      /Site subdomain is required/,
    )
  })

  it.each([
    'acme.chargify.com.evil.example',
    'evil.example',
    'https://acme.chargify.com@evil.example/',
    'deep.acme.chargify.com',
    'acme.chargify.com:8443',
    'ac_me',
  ])('rejects %s, which is not a chargify.com site', async (subdomain) => {
    await expect(adapter.exchangeCredentials({ ...VALID, subdomain })).rejects.toThrow(
      /is not a chargify\.com site/,
    )
  })

  it.each(['acme', 'ACME.chargify.com', 'https://acme.chargify.com/dashboard'])(
    'normalises %s to the bare subdomain',
    async (subdomain) => {
      const creds = await adapter.exchangeCredentials({ apiKey: ' key_abc ', subdomain })
      expect(creds).toEqual({ accessToken: 'key_abc', extra: { subdomain: 'acme' } })
    },
  )
})

describe('Maxio client host and key come from the connection', () => {
  it('calls the site stored on the credentials with the stored API key', async () => {
    const get = vi.fn().mockResolvedValue({ data: {} })
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new MaxioAdapter({ apiKey: '' })
    await adapter
      .getOrganization({ accessToken: 'key_abc', extra: { subdomain: 'acme' } })
      .catch(() => undefined)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://acme.chargify.com/',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('key_abc:x').toString('base64')}`,
        }),
      }),
    )
  })

  it('refuses to build a request when the connection has no subdomain', async () => {
    const get = vi.fn().mockResolvedValue({ data: {} })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new MaxioAdapter({ apiKey: '' })
    await expect(adapter.getOrganization({ accessToken: 'key_abc' })).rejects.toThrow(
      /missing its site subdomain/,
    )
    expect(get).not.toHaveBeenCalled()
  })
})
