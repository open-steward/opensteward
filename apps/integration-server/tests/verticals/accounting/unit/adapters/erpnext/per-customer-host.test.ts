/**
 * ERPNext (Frappe) runs on the customer's own site — self-hosted or Frappe
 * Cloud — and authenticates with `Authorization: token <api_key>:<api_secret>`.
 * The Connect Link form must collect the site URL, key AND secret, refuse
 * non-https / private hosts, and the client must call the stored site instead
 * of the public demo server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver, type Credentials } from '@opensteward/shared'
import { ErpNextAdapter } from '../../../../../../src/verticals/accounting/adapters/erpnext'

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

const adapter = (): ErpNextAdapter => new ErpNextAdapter({ apiKey: '', apiSecret: '', baseUrl: '' })
const valid = { siteUrl: 'https://acme.erpnext.com', apiKey: 'erp-key', apiSecret: 'erp-secret' }

beforeEach(() => {
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '0')
  setDnsResolver(async (host) => {
    if (host === 'erp.internal.example.com') return [{ address: '192.168.10.4' }]
    return [{ address: '93.184.216.34' }]
  })
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('ERPNext Connect Link form', () => {
  it('collects the site URL, API key and API secret', () => {
    const byName = Object.fromEntries(adapter().credentialFields().map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'apiSecret', 'siteUrl'])
    expect(byName['siteUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['apiKey']).toMatchObject({ required: true })
    expect(byName['apiSecret']).toMatchObject({ type: 'password', required: true })
  })

  it.each([
    ['siteUrl', /ERPNext site URL is required/],
    ['apiKey', /ERPNext API key is required/],
    ['apiSecret', /ERPNext API secret is required/],
  ])('rejects a blank %s', async (field, message) => {
    await expect(adapter().exchangeCredentials({ ...valid, [field]: '  ' })).rejects.toThrow(message)
  })

  it('rejects a plain-http site', async () => {
    await expect(
      adapter().exchangeCredentials({ ...valid, siteUrl: 'http://acme.erpnext.com' }),
    ).rejects.toThrow(/ERPNext site URL must use https/)
  })

  it.each(['https://127.0.0.1:8000', 'https://169.254.169.254/', 'https://erp.internal.example.com'])(
    'rejects %s as a private address',
    async (siteUrl) => {
      await expect(adapter().exchangeCredentials({ ...valid, siteUrl })).rejects.toThrow(
        /ERPNext site URL must be publicly reachable/,
      )
    },
  )

  it.each([
    ['https://acme.erpnext.com', 'https://acme.erpnext.com/api/resource/'],
    ['acme.frappe.cloud', 'https://acme.frappe.cloud/api/resource/'],
    ['https://ERP.example.com:8443/app/home?x=1', 'https://erp.example.com:8443/api/resource/'],
    ['https://acme.erpnext.com/api/resource/Sales%20Invoice', 'https://acme.erpnext.com/api/resource/'],
  ])('normalises %s to %s', async (siteUrl, expected) => {
    const creds = await adapter().exchangeCredentials({
      siteUrl,
      apiKey: ' erp-key ',
      apiSecret: ' erp-secret ',
    })
    expect(creds).toEqual({
      accessToken: 'erp-key',
      extra: { apiSecret: 'erp-secret', baseUrl: expected },
    })
  })
})

describe('ERPNext client host', () => {
  it('calls the site stored on the credentials with the token key:secret header', async () => {
    const { created } = captureAxios()
    const creds: Credentials = {
      accessToken: 'erp-key',
      extra: { apiSecret: 'erp-secret', baseUrl: 'https://acme.erpnext.com/api/resource/' },
    }
    await expect(adapter().listInvoices(creds, {})).rejects.toThrow(HALT)
    expect(created[0]?.['baseURL']).toBe('https://acme.erpnext.com/api/resource/')
    expect(created[0]?.['headers']).toMatchObject({ Authorization: 'token erp-key:erp-secret' })
  })

  it('refuses to fall back to the public demo server when no site is known', async () => {
    const { created } = captureAxios()
    const creds: Credentials = { accessToken: 'erp-key', extra: { apiSecret: 'erp-secret' } }
    await expect(adapter().listInvoices(creds, {})).rejects.toThrow(
      /ERPNext connection is missing its site URL/,
    )
    expect(created).toHaveLength(0)
  })
})
