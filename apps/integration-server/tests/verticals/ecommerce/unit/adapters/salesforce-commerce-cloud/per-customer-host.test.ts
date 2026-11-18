/**
 * Every SCAPI URL is on the merchant's short-code host and carries their
 * organization ID (`https://{shortCode}.api.commercecloud.salesforce.com/
 * .../organizations/{organizationId}`), and Shopper APIs need their site ID.
 * All three are the customer's.
 *
 * The adapter read them from deployment config — which the admin UI cannot
 * set — so every URL was `https://undefined.api.commercecloud...`. Its OAuth
 * redirect was SLAS *shopper* login, which signs a shopper into a storefront
 * rather than authorising an integration. The adapter's client calls Shopper
 * APIs, which take a SLAS token, and a private SLAS client obtains one with a
 * client_credentials grant. So the API client credentials and the three
 * identifiers now come from the credential form and are stored in
 * `credentials.extra`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { SalesforceCommerceCloudAdapter } from '../../../../../../src/verticals/ecommerce/adapters/salesforce-commerce-cloud/index'

afterEach(() => {
  vi.restoreAllMocks()
})

const FORM = {
  clientId: 'cid',
  clientSecret: 'sec',
  shortCode: 'kv7kzm78',
  organizationId: 'f_ecom_zzte_053',
  siteId: 'RefArch',
}

const SHORT_CODE_MSG =
  'Salesforce Commerce Cloud short code must be the code from {shortCode}.api.commercecloud.salesforce.com.'

describe('SalesforceCommerceCloudAdapter per-customer instance', () => {
  const adapter = new SalesforceCommerceCloudAdapter()

  it('collects client credentials, short code, organization ID and site ID on the credential form', () => {
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['clientId', true],
      ['clientSecret', true],
      ['shortCode', true],
      ['organizationId', true],
      ['siteId', true],
    ])
  })

  it('does not start a shopper-login redirect', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(
      'Salesforce Commerce Cloud connects with an API client’s client credentials: use the credential form (client ID, secret, short code, organization ID, site ID), not a browser redirect.',
    )
  })

  it('requests a SLAS client_credentials token on the merchant host and stores the identifiers', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', token_type: 'Bearer', expires_in: 1800 },
    })
    const creds = await adapter.exchangeCredentials({
      ...FORM,
      shortCode: ' https://KV7KZM78.api.commercecloud.salesforce.com/ ',
      organizationId: ' F_ECOM_ZZTE_053 ',
    })
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe(
      'https://kv7kzm78.api.commercecloud.salesforce.com/shopper/auth/v1/organizations/f_ecom_zzte_053/oauth2/token',
    )
    const params = new URLSearchParams(String(body))
    expect(params.get('grant_type')).toBe('client_credentials')
    expect(params.get('channel_id')).toBe('RefArch')
    expect((config as { headers: Record<string, string> }).headers['Authorization']).toBe(
      `Basic ${Buffer.from('cid:sec').toString('base64')}`,
    )
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({
      shortCode: 'kv7kzm78',
      organizationId: 'f_ecom_zzte_053',
      siteId: 'RefArch',
      clientId: 'cid',
      clientSecret: 'sec',
    })
  })

  it('rejects foreign hosts, malformed identifiers and blanks before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCredentials({ ...FORM, shortCode: 'kv7kzm78.api.commercecloud.salesforce.com.evil.example' }),
    ).rejects.toThrow(SHORT_CODE_MSG)
    await expect(adapter.exchangeCredentials({ ...FORM, shortCode: 'evil.example' })).rejects.toThrow(
      SHORT_CODE_MSG,
    )
    await expect(adapter.exchangeCredentials({ ...FORM, shortCode: '' })).rejects.toThrow(
      'Salesforce Commerce Cloud short code is required.',
    )
    await expect(adapter.exchangeCredentials({ ...FORM, organizationId: 'zzte_053' })).rejects.toThrow(
      'Salesforce Commerce Cloud organization ID must look like f_ecom_zzte_053.',
    )
    await expect(adapter.exchangeCredentials({ ...FORM, siteId: '  ' })).rejects.toThrow(
      'Salesforce Commerce Cloud site ID is required.',
    )
    await expect(adapter.exchangeCredentials({ ...FORM, clientSecret: '' })).rejects.toThrow(
      'Salesforce Commerce Cloud client ID and client secret are required.',
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('calls SCAPI on the instance stored with the credentials', async () => {
    const fail = () => Promise.reject(new Error('offline'))
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue({ get: fail, post: fail, patch: fail, delete: fail } as never)
    await adapter
      .listProducts({ accessToken: 'tok', extra: { ...FORM } }, {})
      .catch(() => undefined)
    const baseURL = (create.mock.calls[0]![0] as { baseURL?: string }).baseURL
    expect(baseURL).toMatch(
      /^https:\/\/kv7kzm78\.api\.commercecloud\.salesforce\.com\/.+\/organizations\/f_ecom_zzte_053$/,
    )
  })

  it('fails with a readable message, before any request, when the connection has no instance', async () => {
    const create = vi.spyOn(axios, 'create')
    await expect(adapter.listProducts({ accessToken: 'tok' }, {})).rejects.toThrow(
      'Salesforce Commerce Cloud short code is required.',
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('refreshes on the stored instance and keeps the identifiers', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok2', token_type: 'Bearer', expires_in: 1800 },
    })
    const creds = await adapter.refreshCredentials({ accessToken: 'old', extra: { ...FORM } })
    expect(post.mock.calls[0]![0]).toBe(
      'https://kv7kzm78.api.commercecloud.salesforce.com/shopper/auth/v1/organizations/f_ecom_zzte_053/oauth2/token',
    )
    expect(creds.accessToken).toBe('tok2')
    expect(creds.extra).toEqual(FORM)
  })
})
