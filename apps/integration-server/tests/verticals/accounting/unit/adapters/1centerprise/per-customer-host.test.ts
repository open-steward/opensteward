/**
 * 1C:Enterprise is installed per customer: each infobase publishes its
 * standard OData interface at `<publication>/odata/standard.odata` on the
 * customer's own web server. The Connect Link form must collect that URL
 * alongside the access token, refuse non-https / private hosts, and the client
 * must call the stored publication instead of a placeholder demo host.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver, type Credentials } from '@opensteward/shared'
import { OneCEnterpriseAdapter } from '../../../../../../src/verticals/accounting/adapters/1centerprise'
import { OneCEnterpriseClient } from '../../../../../../src/verticals/accounting/adapters/1centerprise/client'

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

const adapter = (): OneCEnterpriseAdapter =>
  new OneCEnterpriseAdapter({ clientId: '', clientSecret: '', redirectUri: '', scopes: [] })
const valid = { odataUrl: 'https://1c.example.com/accounting', accessToken: 'jwt-token' }

beforeEach(() => {
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '0')
  setDnsResolver(async (host) => {
    if (host === '1c.corp.example.com') return [{ address: '172.16.3.9' }]
    return [{ address: '93.184.216.34' }]
  })
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('1C:Enterprise Connect Link form', () => {
  it('collects the OData publication URL and the access token', () => {
    const byName = Object.fromEntries(adapter().credentialFields().map((f) => [f.name, f]))
    // username/password were added for the HTTP Basic transport 1C actually
    // publishes OData with; accessToken remains for accessTokenAuthentication
    // publications.
    expect(Object.keys(byName).sort()).toEqual(['accessToken', 'odataUrl', 'password', 'username'])
    expect(byName['odataUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['accessToken']).toMatchObject({ type: 'password', required: false })
  })

  it.each([
    ['odataUrl', /1C OData URL is required/],
    ['accessToken', /Supply either an infobase user and password/],
  ])('rejects a blank %s', async (field, message) => {
    await expect(adapter().exchangeCredentials({ ...valid, [field]: '' })).rejects.toThrow(message)
  })

  it('rejects a plain-http publication', async () => {
    await expect(
      adapter().exchangeCredentials({ ...valid, odataUrl: 'http://1c.example.com/accounting' }),
    ).rejects.toThrow(/1C OData URL must use https/)
  })

  it.each(['https://192.168.1.20/accounting', 'https://1c.corp.example.com/base'])(
    'rejects %s as a private address',
    async (odataUrl) => {
      await expect(adapter().exchangeCredentials({ ...valid, odataUrl })).rejects.toThrow(
        /1C OData URL must be publicly reachable/,
      )
    },
  )

  it.each([
    ['https://1c.example.com/accounting', 'https://1c.example.com/accounting/odata/standard.odata'],
    ['https://1c.example.com/accounting/', 'https://1c.example.com/accounting/odata/standard.odata'],
    [
      'https://1C.example.com:8443/acc/odata/standard.odata/Catalog_Items?$format=json',
      'https://1c.example.com:8443/acc/odata/standard.odata',
    ],
    ['1c.example.com', 'https://1c.example.com/odata/standard.odata'],
  ])('normalises %s to %s', async (odataUrl, expected) => {
    const creds = await adapter().exchangeCredentials({ odataUrl, accessToken: ' jwt-token ' })
    expect(creds).toEqual({ accessToken: 'jwt-token', extra: { baseUrl: expected } })
  })
})

describe('1C:Enterprise client host', () => {
  it('calls the publication stored on the credentials with the bearer token', async () => {
    const { created } = captureAxios()
    const creds: Credentials = {
      accessToken: 'jwt-token',
      extra: { baseUrl: 'https://1c.example.com/accounting/odata/standard.odata' },
    }
    await expect(new OneCEnterpriseClient(creds).get('SomeEntitySet')).rejects.toThrow(HALT)
    expect(created[0]?.['baseURL']).toBe('https://1c.example.com/accounting/odata/standard.odata/')
    expect(created[0]?.['headers']).toMatchObject({ Authorization: 'Bearer jwt-token' })
  })

  it('refuses to fall back to a placeholder host when no publication is known', () => {
    const { created } = captureAxios()
    expect(() => new OneCEnterpriseClient({ accessToken: 'jwt-token' })).toThrow(
      /1C connection is missing its OData URL/,
    )
    expect(created).toHaveLength(0)
  })
})
