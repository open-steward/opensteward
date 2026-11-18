/**
 * Every HaloPSA instance lives on the customer's own host
 * (`https://acme.halopsa.com`, or a self-hosted domain). Token endpoint and
 * API both hang off it, and the token request carries the client secret.
 *
 * HaloPSA authenticates integrations with client_credentials, so the host is
 * collected by `credentialFields()` and stored in `credentials.extra`. What was
 * missing was host safety: the URL went into the token POST verbatim — any
 * scheme, any path, any address, including private networks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver, SsrfBlockedError } from '@opensteward/shared'
import { HalopsaAdapter } from '../../../../../src/verticals/customer-support/adapters/halopsa'

const PUBLIC = async () => [{ address: '93.184.216.34' }]

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => tokenResponse())
  vi.stubGlobal('fetch', fetchMock)
  setDnsResolver(PUBLIC)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

const FIELDS = { clientId: 'cid', clientSecret: 'sec' }

describe('HaloPSA per-customer host', () => {
  const adapter = new HalopsaAdapter()

  it('collects the instance URL on the credential form (client_credentials, not OAuth redirect)', () => {
    expect(adapter.credentialFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'tenantUrl', required: true }),
        expect.objectContaining({ name: 'tenant', required: false }),
        expect.objectContaining({ name: 'clientId' }),
        expect.objectContaining({ name: 'clientSecret' }),
      ]),
    )
    expect((adapter as { oauthFields?: unknown }).oauthFields).toBeUndefined()
  })

  it('exchanges on the customer host and stores the normalised origin in extra', async () => {
    const creds = await adapter.exchangeCredentials({
      ...FIELDS,
      tenantUrl: '  https://Acme.HaloPSA.com/tickets?view=1  ',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Halo-hosted instances need the tenant on the token request.
    expect(fetchMock.mock.calls[0]![0]).toBe('https://acme.halopsa.com/auth/token?tenant=acme')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({
      tenantUrl: 'https://acme.halopsa.com',
      tenant: 'acme',
      clientId: 'cid',
      clientSecret: 'sec',
    })
  })

  it('sends no tenant for a self-hosted instance, and an explicit tenant when given', async () => {
    const selfHosted = await adapter.exchangeCredentials({ ...FIELDS, tenantUrl: 'https://halo.example.com' })
    expect(fetchMock.mock.calls[0]![0]).toBe('https://halo.example.com/auth/token')
    expect(selfHosted.extra).not.toHaveProperty('tenant')

    await adapter.exchangeCredentials({ ...FIELDS, tenantUrl: 'https://acme.halopsa.com', tenant: 'Acme_Prod' })
    expect(fetchMock.mock.calls[1]![0]).toBe('https://acme.halopsa.com/auth/token?tenant=Acme_Prod')
  })

  it('rejects a tenant name that is not a plain identifier', async () => {
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, tenantUrl: 'https://acme.halopsa.com', tenant: 'a&b=c' }),
    ).rejects.toThrow('HaloPSA tenant name must contain only letters, digits, hyphens and underscores.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a bare host by assuming https', async () => {
    const creds = await adapter.exchangeCredentials({ ...FIELDS, tenantUrl: 'acme.halopsa.com' })
    expect(fetchMock.mock.calls[0]![0]).toBe('https://acme.halopsa.com/auth/token?tenant=acme')
    expect(creds.extra?.['tenantUrl']).toBe('https://acme.halopsa.com')
  })

  it('rejects a blank URL before any request', async () => {
    await expect(adapter.exchangeCredentials({ ...FIELDS, tenantUrl: '   ' })).rejects.toThrow(
      'HaloPSA URL is required (e.g. https://yourcompany.halopsa.com).',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects plain http — the client secret must not travel in clear', async () => {
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, tenantUrl: 'http://acme.halopsa.com' }),
    ).rejects.toThrow('HaloPSA URL must use https://.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects something that is not a URL at all', async () => {
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, tenantUrl: 'https://' }),
    ).rejects.toThrow('HaloPSA URL is not a valid URL.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a host that resolves to a private address before sending the secret', async () => {
    setDnsResolver(async () => [{ address: '10.0.0.5' }])
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, tenantUrl: 'https://halo.internal.example' }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('re-checks the stored host on refresh, which re-sends the secret', async () => {
    setDnsResolver(async () => [{ address: '127.0.0.1' }])
    await expect(
      adapter.refreshCredentials({
        accessToken: 'old',
        extra: { tenantUrl: 'https://acme.halopsa.com', clientId: 'cid', clientSecret: 'sec' },
      }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls the API on the host stored with the credentials', async () => {
    const fail = () => Promise.reject(new Error('offline'))
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue({ get: fail, post: fail } as never)
    await adapter
      .listTickets({ accessToken: 'tok', extra: { tenantUrl: 'https://acme.halopsa.com' } }, {})
      .catch(() => undefined)
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://acme.halopsa.com/api',
    )
  })
})
