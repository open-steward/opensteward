/**
 * Dolibarr is self-hosted: the REST API lives at `<instance>/api/index.php/`
 * on the customer's own server. The Connect Link form must collect that
 * instance URL alongside the DOLAPIKEY, refuse anything that would send the
 * key over plain HTTP or into a private network, and the client must call the
 * stored instance instead of the public demo server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver, type Credentials } from '@opensteward/shared'
import { DolibarrAdapter } from '../../../../../../src/verticals/accounting/adapters/dolibarr'

const HALT = 'request-captured'

function captureAxios(): { created: Array<Record<string, unknown>> } {
  const created: Array<Record<string, unknown>> = []
  const halt = async (): Promise<never> => {
    throw new Error(HALT)
  }
  vi.spyOn(axios, 'create').mockImplementation(((config: Record<string, unknown>) => {
    created.push(config)
    return { get: halt, post: halt, put: halt, delete: halt }
  }) as unknown as typeof axios.create)
  return { created }
}

const adapter = (): DolibarrAdapter => new DolibarrAdapter({ apiKey: '' })

beforeEach(() => {
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '0')
  setDnsResolver(async (host) => {
    if (host === 'intranet.example.com') return [{ address: '10.0.0.5' }]
    if (host === 'nowhere.example.com') throw new Error('getaddrinfo ENOTFOUND nowhere.example.com')
    return [{ address: '93.184.216.34' }]
  })
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Dolibarr Connect Link form', () => {
  it('collects the instance URL and the API key', () => {
    const byName = Object.fromEntries(adapter().credentialFields().map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'baseUrl'])
    expect(byName['baseUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
  })

  it('rejects a blank instance URL', async () => {
    await expect(adapter().exchangeCredentials({ baseUrl: ' ', apiKey: 'dol-key' })).rejects.toThrow(
      /Dolibarr URL is required/,
    )
  })

  it('rejects a blank API key', async () => {
    await expect(
      adapter().exchangeCredentials({ baseUrl: 'https://erp.example.com', apiKey: '' }),
    ).rejects.toThrow(/Dolibarr API key is required/)
  })

  it('rejects a plain-http instance', async () => {
    await expect(
      adapter().exchangeCredentials({ baseUrl: 'http://erp.example.com', apiKey: 'dol-key' }),
    ).rejects.toThrow(/Dolibarr URL must use https/)
  })

  it('rejects credentials embedded in the URL', async () => {
    await expect(
      adapter().exchangeCredentials({ baseUrl: 'https://admin:pw@erp.example.com', apiKey: 'dol-key' }),
    ).rejects.toThrow(/must not include a username or password/)
  })

  it.each([
    'https://127.0.0.1/dolibarr',
    'https://10.1.2.3',
    'https://[::1]/',
    'https://intranet.example.com/dolibarr',
  ])('rejects %s as a private address', async (baseUrl) => {
    await expect(adapter().exchangeCredentials({ baseUrl, apiKey: 'dol-key' })).rejects.toThrow(
      /Dolibarr URL must be publicly reachable/,
    )
  })

  it('rejects a host that does not resolve', async () => {
    await expect(
      adapter().exchangeCredentials({ baseUrl: 'https://nowhere.example.com', apiKey: 'dol-key' }),
    ).rejects.toThrow(/could not be resolved/)
  })

  it.each([
    ['https://erp.example.com', 'https://erp.example.com/api/index.php/'],
    ['erp.example.com/', 'https://erp.example.com/api/index.php/'],
    ['https://erp.example.com/dolibarr/', 'https://erp.example.com/dolibarr/api/index.php/'],
    ['https://ERP.example.com:8443/index.php?mainmenu=home', 'https://erp.example.com:8443/api/index.php/'],
    ['https://erp.example.com/api/index.php/explorer#top', 'https://erp.example.com/api/index.php/'],
  ])('normalises %s to %s', async (baseUrl, expected) => {
    const creds = await adapter().exchangeCredentials({ baseUrl, apiKey: ' dol-key ' })
    expect(creds).toEqual({ accessToken: 'dol-key', extra: { baseUrl: expected } })
  })
})

describe('Dolibarr client host', () => {
  it('calls the instance stored on the credentials with the DOLAPIKEY header', async () => {
    const { created } = captureAxios()
    const creds: Credentials = {
      accessToken: 'dol-key',
      extra: { baseUrl: 'https://erp.example.com/dolibarr/api/index.php/' },
    }
    await expect(adapter().listInvoices(creds, {})).rejects.toThrow(HALT)
    expect(created[0]?.['baseURL']).toBe('https://erp.example.com/dolibarr/api/index.php/')
    expect(created[0]?.['headers']).toMatchObject({ DOLAPIKEY: 'dol-key' })
  })

  it('refuses to fall back to the public demo server when no instance is known', async () => {
    const { created } = captureAxios()
    await expect(adapter().listInvoices({ accessToken: 'dol-key' }, {})).rejects.toThrow(
      /Dolibarr connection is missing its instance URL/,
    )
    expect(created).toHaveLength(0)
  })
})
