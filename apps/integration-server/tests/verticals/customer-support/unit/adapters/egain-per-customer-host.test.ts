/**
 * eGain's OAuth endpoints are per tenant
 * (`https://ai.egain.cloud/system/auth/{tenantId}-U/oauth2/...`) and the
 * Interaction API lives on the customer's own `*.egain.cloud` host. Both are
 * the customer's.
 *
 * The adapter read them from deployment config — which the admin UI cannot
 * set — and collected them on `credentialFields()`, which the Connect flow
 * never calls for an oauth2 adapter; without a tenant it built an authorize
 * URL containing the literal `{tenantId}`. A `getAuthUrlForTenant()` existed
 * that nothing called. Now both are `oauthFields`, validated, used by the
 * authorize URL and token exchange, stored in `credentials.extra`, and read by
 * the API client.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { EgainAdapter } from '../../../../../src/verticals/customer-support/adapters/egain'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/customer-support/egain/callback',
}
const INPUTS = { tenantId: 'ACME123', tenantHost: 'acme.egain.cloud' }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('EgainAdapter per-customer tenant', () => {
  const adapter = new EgainAdapter(CFG)

  it('declares tenant ID and host as required oauthFields', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'tenantId', required: true }),
      expect.objectContaining({ name: 'tenantHost', required: true }),
    ])
    expect((adapter as { credentialFields?: unknown }).credentialFields).toBeUndefined()
  })

  it('builds the authorize URL for the customer’s tenant', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, {
        tenantId: ' ACME123 ',
        tenantHost: 'https://acme.egain.cloud/system/',
      }),
    )
    expect(u.host).toBe('ai.egain.cloud')
    expect(u.pathname).toBe('/system/auth/ACME123-U/oauth2/authorize')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('throws instead of building a `{tenantId}` placeholder when no tenant is known', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow('eGain tenant ID is required.')
  })

  it('rejects a path-unsafe tenant ID and a host outside egain.cloud before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    expect(() =>
      adapter.getAuthUrl('st', undefined, undefined, { ...INPUTS, tenantId: 'ACME/../X' }),
    ).toThrow('eGain tenant ID must contain only letters and digits.')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
        ...INPUTS,
        tenantHost: 'acme.egain.cloud.evil.example',
      }),
    ).rejects.toThrow('eGain host must be an *.egain.cloud host.')
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { ...INPUTS, tenantHost: ' ' }),
    ).rejects.toThrow('eGain host is required (e.g. acme.egain.cloud).')
    expect(post).not.toHaveBeenCalled()
  })

  it('exchanges on the tenant’s token endpoint and stores the normalised values', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', refresh_token: 'rt', expires_in: 3600 },
    })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      tenantId: 'ACME123',
      tenantHost: 'https://Acme.eGain.cloud/',
    })
    expect(post.mock.calls[0]![0]).toBe('https://ai.egain.cloud/system/auth/ACME123-U/oauth2/token')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({
      tenantId: 'ACME123',
      tenantHost: 'acme.egain.cloud',
      clientId: 'cid',
      clientSecret: 'sec',
    })
  })

  it('calls the API on the host stored with the credentials', async () => {
    const fail = () => Promise.reject(new Error('offline'))
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get: fail } as never)
    await adapter
      .listTickets({ accessToken: 'tok', extra: { ...INPUTS } }, {})
      .catch(() => undefined)
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://acme.egain.cloud/system/ws/v12',
    )
  })

  it('refuses to send the bearer token to a stored host outside egain.cloud', async () => {
    const create = vi.spyOn(axios, 'create')
    await expect(
      adapter.listTickets({ accessToken: 'tok', extra: { ...INPUTS, tenantHost: 'evil.example' } }, {}),
    ).rejects.toThrow('eGain host must be an *.egain.cloud host.')
    expect(create).not.toHaveBeenCalled()
  })
})
