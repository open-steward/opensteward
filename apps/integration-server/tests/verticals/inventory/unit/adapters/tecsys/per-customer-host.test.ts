/**
 * Tecsys OrderDynamics authenticates with the Azure AD client_credentials
 * grant. The API host is fixed (`api.orderdynamics.net`); the per-customer
 * values are the Azure tenant — a PATH segment of the fixed
 * `login.microsoftonline.com` token URL — and the APIM subscription key the
 * client sends as `Ocp-Apim-Subscription-Key`.
 *
 * NOTE: metadata still labels tecsys `auth_type: 'oauth2'`, which makes the
 * Connect page skip `credentialFields()`. The form renders once the platform is
 * relabelled `oauth2_cc`; these tests pin that the form and exchange are
 * correct and complete for when it does.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { TecsysAdapter } from '../../../../../../src/verticals/inventory/adapters/tecsys'
import { TecsysClient } from '../../../../../../src/verticals/inventory/adapters/tecsys/client'

afterEach(() => vi.restoreAllMocks())

const GUID = '72f988bf-86f1-41af-91ab-2d7cd011db47'

function mockPost() {
  return vi
    .spyOn(axios, 'post')
    .mockResolvedValue({ data: { access_token: 'tok', expires_in: 3599, token_type: 'Bearer' } })
}

describe('Tecsys per-customer Azure tenant and subscription key', () => {
  const adapter = new TecsysAdapter()

  it('declares the tenant and the subscription key on the credential form (renders once relabelled oauth2_cc)', () => {
    const fields = adapter.credentialFields()
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'tenantId', type: 'text', required: true }),
        expect.objectContaining({ name: 'clientId', required: true }),
        expect.objectContaining({ name: 'clientSecret', type: 'password', required: true }),
        expect.objectContaining({ name: 'subscriptionKey', type: 'password', required: false }),
      ]),
    )
  })

  it.each([
    [` ${GUID.toUpperCase()} `, GUID],
    ['Contoso.onmicrosoft.com', 'contoso.onmicrosoft.com'],
    [`https://login.microsoftonline.com/${GUID}/oauth2/v2.0/token`, GUID],
  ])('requests the token for the normalised tenant %j and stores it with the key', async (input, want) => {
    const post = mockPost()
    const creds = await adapter.exchangeCredentials({
      tenantId: input,
      clientId: ' app-id ',
      clientSecret: 'sec',
      subscriptionKey: ' sub-key ',
    })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]![0]).toBe(`https://login.microsoftonline.com/${want}/oauth2/v2.0/token`)
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({
      tenantId: want,
      clientId: 'app-id',
      clientSecret: 'sec',
      subscriptionKey: 'sub-key',
    })
  })

  it('omits the subscription key from extra when none was supplied', async () => {
    mockPost()
    const creds = await adapter.exchangeCredentials({ tenantId: GUID, clientId: 'a', clientSecret: 's' })
    expect(creds.extra).toEqual({ tenantId: GUID, clientId: 'a', clientSecret: 's' })
  })

  it.each(['common', 'organizations', 'evil.example/../x', 'https://evil.example/' + GUID])(
    'rejects %j as a tenant without making a request',
    async (tenantId) => {
      const post = mockPost()
      await expect(
        adapter.exchangeCredentials({ tenantId, clientId: 'a', clientSecret: 's' }),
      ).rejects.toThrow(/Azure tenant ID must be a directory \(tenant\) GUID or a verified domain/)
      expect(post).not.toHaveBeenCalled()
    },
  )

  it('names what is missing and makes no request', async () => {
    const post = mockPost()
    await expect(
      adapter.exchangeCredentials({ tenantId: ' ', clientId: 'a', clientSecret: 's' }),
    ).rejects.toThrow(/Azure tenant ID is required/)
    await expect(
      adapter.exchangeCredentials({ tenantId: GUID, clientId: ' ', clientSecret: 's' }),
    ).rejects.toThrow(/Azure client ID is required/)
    await expect(
      adapter.exchangeCredentials({ tenantId: GUID, clientId: 'a', clientSecret: '' }),
    ).rejects.toThrow(/Azure client secret is required/)
    expect(post).not.toHaveBeenCalled()
  })

  it('sends the stored subscription key to the fixed API host', () => {
    const create = vi.spyOn(axios, 'create')
    new TecsysClient({ accessToken: 't', extra: { tenantId: GUID, subscriptionKey: 'sub-key' } })
    const cfg = create.mock.calls[0]![0]!
    expect(cfg.baseURL).toBe('https://api.orderdynamics.net/v1')
    expect((cfg.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe('sub-key')
  })
})
