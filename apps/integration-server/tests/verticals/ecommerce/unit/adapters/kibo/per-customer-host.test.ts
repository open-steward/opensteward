/**
 * Kibo Commerce is multi-tenant: each tenant's API lives on its own host —
 * `t{tenantId}.sandbox.mozu.com`, `t{tenantId}.tp0.mozu.com`, or a regional
 * `t{tenantId}.….kibocommerce.com` — and the client_credentials token endpoint
 * lives on that host too (JSON body). The host is the customer's.
 *
 * The credential form collected only client ID + secret, so `extra.tenant`
 * was never set: every API call went to the shared `api.mozu.com` and every
 * token request to the legacy global host. The tenant host is now a form
 * field, validated against Kibo's own domains, used for the token exchange,
 * stored in `credentials.extra`, and read by the API client.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { KiboAdapter } from '../../../../../../src/verticals/ecommerce/adapters/kibo/index'

afterEach(() => {
  vi.restoreAllMocks()
})

const FORM = { clientId: 'cid', clientSecret: 'sec', tenantHost: 't12345.sandbox.mozu.com' }
const HOST_MSG = 'Kibo tenant host must be your t{tenantId}….mozu.com or t{tenantId}….kibocommerce.com host.'

describe('KiboAdapter per-customer tenant host', () => {
  const adapter = new KiboAdapter()

  it('collects the tenant host alongside the client credentials', () => {
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['clientId', true],
      ['clientSecret', true],
      ['tenantHost', true],
    ])
  })

  it('requests the token on the tenant host and stores the normalised host', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', token_type: 'bearer', expires_in: 3600 },
    })
    const creds = await adapter.exchangeCredentials({
      ...FORM,
      tenantHost: ' https://T12345.Sandbox.Mozu.com/admin ',
    })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]![0]).toBe(
      'https://t12345.sandbox.mozu.com/api/platform/applications/authtickets/oauth',
    )
    expect(post.mock.calls[0]![1]).toEqual({
      client_id: 'cid',
      client_secret: 'sec',
      grant_type: 'client_credentials',
    })
    expect(creds.accessToken).toBe('tok')
    expect(creds.expiresAt).toBeInstanceOf(Date)
    expect(creds.extra).toEqual({
      tenantHost: 't12345.sandbox.mozu.com',
      clientId: 'cid',
      clientSecret: 'sec',
    })
  })

  it('accepts a regional kibocommerce.com tenant host', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok' } })
    await adapter.exchangeCredentials({ ...FORM, tenantHost: 't12345.sb.euw0.kibocommerce.com' })
    expect(post.mock.calls[0]![0]).toBe(
      'https://t12345.sb.euw0.kibocommerce.com/api/platform/applications/authtickets/oauth',
    )
  })

  it('rejects foreign hosts, non-tenant hosts, blanks and missing secrets before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    for (const tenantHost of ['t12345.sandbox.mozu.com.evil.example', 'evil.example', 'www.mozu.com', 't12345']) {
      await expect(adapter.exchangeCredentials({ ...FORM, tenantHost })).rejects.toThrow(HOST_MSG)
    }
    await expect(adapter.exchangeCredentials({ ...FORM, tenantHost: ' ' })).rejects.toThrow(
      'Kibo tenant host is required (e.g. t12345.sandbox.mozu.com).',
    )
    await expect(adapter.exchangeCredentials({ ...FORM, clientSecret: '' })).rejects.toThrow(
      'Kibo client ID and client secret are required.',
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('calls the API on the stored tenant host with the tenant header', async () => {
    const fail = () => Promise.reject(new Error('offline'))
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue({ get: fail, post: fail, put: fail, delete: fail } as never)
    await adapter
      .listProducts({ accessToken: 'tok', extra: { tenantHost: 't12345.sandbox.mozu.com' } }, {})
      .catch(() => undefined)
    const cfg = create.mock.calls[0]![0] as { baseURL?: string; headers?: Record<string, string> }
    expect(cfg.baseURL).toBe('https://t12345.sandbox.mozu.com')
    expect(cfg.headers?.['x-vol-tenant']).toBe('12345')
  })

  it('refuses a foreign stored tenant host before any request', async () => {
    const create = vi.spyOn(axios, 'create')
    await expect(
      adapter.listProducts({ accessToken: 'tok', extra: { tenantHost: 'evil.example' } }, {}),
    ).rejects.toThrow(HOST_MSG)
    expect(create).not.toHaveBeenCalled()
  })

  it('refreshes on the stored tenant host', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok2', expires_in: 3600 } })
    const creds = await adapter.refreshCredentials({ accessToken: 'old', extra: { ...FORM } })
    expect(post.mock.calls[0]![0]).toBe(
      'https://t12345.sandbox.mozu.com/api/platform/applications/authtickets/oauth',
    )
    expect(creds.accessToken).toBe('tok2')
    expect(creds.extra).toEqual(FORM)
  })
})
