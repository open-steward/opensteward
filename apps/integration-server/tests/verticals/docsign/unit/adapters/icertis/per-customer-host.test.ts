/**
 * Icertis (ICI) authorises through Microsoft Entra ID, but every API call goes
 * to the customer's regional ICI gateway (`https://api-<region><N>.icertis.com`)
 * with the customer's `ici-product-key`, and the Entra app usually lives in the
 * customer's own directory. All three came only from deployment config — which
 * the admin UI cannot write — so every connection silently called a shared
 * NON-PRODUCTION gateway with a production token.
 *
 * The gateway is now a required `oauthField` (kept on icertis.com), the tenant
 * and product key optional ones, and all are carried on `credentials.extra`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { IcertisAdapter } from '../../../../../../src/verticals/docsign/adapters/icertis/index'
import {
  normaliseEntraTenant,
  normaliseIcertisGatewayUrl,
} from '../../../../../../src/verticals/docsign/adapters/icertis/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/docsign/icertis/callback',
}
const TOKEN = { access_token: 'tok', refresh_token: 'ref', token_type: 'Bearer', expires_in: 3600 }
const TENANT = '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0'
const REQUIRED = 'Icertis API gateway URL is required (e.g. https://api-us1.icertis.com).'
const FOREIGN = 'Icertis API gateway must be an *.icertis.com host.'
const NOT_CONFIGURED = 'Icertis API gateway URL is not configured for this connection.'

function fakeHttp() {
  const http = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  }
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
  return () =>
    create.mock.calls.at(-1)?.[0] as { baseURL?: string; headers?: Record<string, string> } | undefined
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseIcertisGatewayUrl', () => {
  it.each([
    ['api-us1.icertis.com', 'https://api-us1.icertis.com'],
    ['https://API-IN1-NONPROD.icertis.com/api/v1/', 'https://api-in1-nonprod.icertis.com'],
    [' https://acme.icertis.com ', 'https://acme.icertis.com'],
  ])('%s → %s', (input, want) => {
    expect(normaliseIcertisGatewayUrl(input)).toBe(want)
  })

  it('rejects blanks and plain http with specific messages', () => {
    expect(() => normaliseIcertisGatewayUrl('')).toThrow(REQUIRED)
    expect(() => normaliseIcertisGatewayUrl(undefined)).toThrow(REQUIRED)
    expect(() => normaliseIcertisGatewayUrl('http://api-us1.icertis.com')).toThrow(
      'Icertis API gateway URL must use https.',
    )
  })

  it('rejects hosts outside icertis.com — every API call carries the bearer token there', () => {
    expect(() => normaliseIcertisGatewayUrl('https://evil.example')).toThrow(FOREIGN)
    expect(() => normaliseIcertisGatewayUrl('api-us1.icertis.com.evil.example')).toThrow(FOREIGN)
    expect(() => normaliseIcertisGatewayUrl('icertis.com')).toThrow(FOREIGN)
  })
})

describe('normaliseEntraTenant', () => {
  it('accepts a directory ID or a verified domain, lowercased', () => {
    expect(normaliseEntraTenant(TENANT.toUpperCase())).toBe(TENANT)
    expect(normaliseEntraTenant(' Contoso.onmicrosoft.com ')).toBe('contoso.onmicrosoft.com')
  })

  it('rejects values that would change the login URL path', () => {
    expect(() => normaliseEntraTenant('common/../x')).toThrow(
      'Microsoft Entra tenant ID must be a directory (tenant) ID or a verified domain.',
    )
  })
})

describe('IcertisAdapter with a per-customer gateway', () => {
  const adapter = new IcertisAdapter(CFG)

  it('declares the gateway as required and tenant/product key as optional oauthFields', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'instanceUrl', required: true }),
      expect.objectContaining({ name: 'tenantId', required: false }),
      expect.objectContaining({ name: 'productKey', required: false, type: 'password' }),
    ])
  })

  it('authorises on the customer directory', () => {
    const u = new URL(
      adapter.getAuthUrl('st', undefined, undefined, {
        instanceUrl: 'api-us1.icertis.com',
        tenantId: TENANT,
      }),
    )
    expect(u.host).toBe('login.microsoftonline.com')
    expect(u.pathname).toBe(`/${TENANT}/oauth2/v2.0/authorize`)
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('falls back to the multi-tenant endpoint when no directory is given', () => {
    const u = new URL(adapter.getAuthUrl('st', undefined, undefined, { instanceUrl: 'api-us1.icertis.com' }))
    expect(u.pathname).toBe('/common/oauth2/v2.0/authorize')
  })

  it('refuses to start without a gateway, and with a foreign one', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(REQUIRED)
    expect(() =>
      adapter.getAuthUrl('st', undefined, undefined, { instanceUrl: 'https://evil.example' }),
    ).toThrow(FOREIGN)
  })

  it('exchanges on the customer directory and stores the normalised gateway in extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, {
      instanceUrl: 'https://API-US1.icertis.com/',
      tenantId: TENANT,
      productKey: 'pk-123',
    })
    expect(post.mock.calls[0][0]).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`)
    expect(creds.extra).toEqual({
      tenantId: TENANT,
      instanceUrl: 'https://api-us1.icertis.com',
      productKey: 'pk-123',
    })
  })

  it('refuses a foreign gateway before any request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
    await expect(
      adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { instanceUrl: 'api-us1.icertis.com.evil.example' }),
    ).rejects.toThrow(FOREIGN)
    expect(post).not.toHaveBeenCalled()
  })

  it('calls the API on the gateway stored with the credentials, with its product key', async () => {
    const createArgs = fakeHttp()
    await adapter.listTemplates(
      { accessToken: 'tok', extra: { instanceUrl: 'https://api-us1.icertis.com', productKey: 'pk-123' } },
      {},
    )
    expect(createArgs()?.baseURL).toBe('https://api-us1.icertis.com/api/v1')
    expect(createArgs()?.headers?.['ici-product-key']).toBe('pk-123')
  })

  it('refuses to call the shared non-production gateway when the connection has none', async () => {
    fakeHttp()
    await expect(adapter.listTemplates({ accessToken: 'tok' }, {})).rejects.toThrow(NOT_CONFIGURED)
  })
})
