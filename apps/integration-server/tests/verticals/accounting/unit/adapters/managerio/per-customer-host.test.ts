/**
 * Manager.io is self-hosted (Server edition) or cloud-hosted per business, so
 * the API endpoint is a per-customer value. It has to be collected by the
 * Connect Link form, vetted (https, public host) and stored where the client
 * reads it — a deployment-level `instanceUrl` is never filled per customer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { ManagerioAdapter } from '../../../../../../src/verticals/accounting/adapters/managerio'

const PUBLIC_IP = '93.184.216.34'
const PRIVATE_IP = '10.0.0.7'

let savedAllow: string | undefined
beforeEach(() => {
  savedAllow = process.env['OST_ALLOW_PRIVATE_HOSTS']
  delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  setDnsResolver(async (host) => ({
    address: host.endsWith('.internal.example') ? PRIVATE_IP : PUBLIC_IP,
  }))
})
afterEach(() => {
  setDnsResolver(undefined)
  if (savedAllow === undefined) delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  else process.env['OST_ALLOW_PRIVATE_HOSTS'] = savedAllow
  vi.restoreAllMocks()
})

const VALID = { apiKey: 'tok_123', instanceUrl: 'https://acme.manager.io/api2' }

describe('Manager.io Connect Link form', () => {
  const adapter = new ManagerioAdapter()

  it('declares the access token and the API endpoint the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'instanceUrl'])
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['instanceUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['instanceUrl']?.helpText).toMatch(/Access Tokens/)
  })

  it('rejects a blank access token', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, apiKey: '  ' })).rejects.toThrow(
      /Access token is required/,
    )
  })

  it('rejects a blank API endpoint', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, instanceUrl: '' })).rejects.toThrow(
      /API endpoint is required/,
    )
  })

  it('rejects an endpoint that is not https', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, instanceUrl: 'http://acme.manager.io/api2' }),
    ).rejects.toThrow(/must use https/)
  })

  it('rejects an endpoint that is not a URL', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, instanceUrl: 'acme manager' }),
    ).rejects.toThrow(/must be a full URL/)
  })

  it('rejects a server whose name resolves to a private address', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, instanceUrl: 'https://books.internal.example/api2' }),
    ).rejects.toThrow(/private or reserved network address/)
  })

  it('rejects a literal private IP', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, instanceUrl: 'https://192.168.1.20:8080/api2' }),
    ).rejects.toThrow(/private or reserved network address/)
  })

  it('normalises the pasted endpoint and stores it where the client reads it', async () => {
    const creds = await adapter.exchangeCredentials({
      apiKey: ' tok_123 ',
      instanceUrl: ' https://acme.manager.io/api2/ ',
    })
    expect(creds).toEqual({ accessToken: 'tok_123', extra: { instanceUrl: 'https://acme.manager.io' } })
  })

  it('keeps a sub-path prefix for a server hosted below the root', async () => {
    const creds = await adapter.exchangeCredentials({
      ...VALID,
      instanceUrl: 'https://erp.example.com/manager/api2?x=1#frag',
    })
    expect(creds.extra).toEqual({ instanceUrl: 'https://erp.example.com/manager' })
  })
})

describe('Manager.io client host comes from the connection', () => {
  it('calls the API endpoint stored on the credentials', async () => {
    const get = vi.fn().mockResolvedValue({ data: {} })
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new ManagerioAdapter()
    await adapter
      .getOrganization({ accessToken: 'tok_123', extra: { instanceUrl: 'https://acme.manager.io' } })
      .catch(() => undefined)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://acme.manager.io/api2/',
        headers: expect.objectContaining({ 'X-API-Key': 'tok_123' }),
      }),
    )
    expect(get).toHaveBeenCalled()
  })

  it('refuses to build a request when the connection has no server URL', async () => {
    const get = vi.fn().mockResolvedValue({ data: {} })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new ManagerioAdapter()
    await expect(adapter.getOrganization({ accessToken: 'tok_123' })).rejects.toThrow(
      /missing its server URL/,
    )
    expect(get).not.toHaveBeenCalled()
  })
})
