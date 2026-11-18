/**
 * Unicommerce (Uniware) is tenant-hosted at `https://{tenant}.unicommerce.com`
 * and authenticates with the OAuth2 PASSWORD grant against that tenant's
 * `/oauth/token` using the fixed public client `my-trusted-client`. No browser
 * redirect exists, so tenant, username and password are collected through
 * `credentialFields()` / `exchangeCredentials()`.
 *
 * NOTE: metadata still labels unicommerce `auth_type: 'oauth2'`, which makes
 * the Connect page skip `credentialFields()`. The form renders once the
 * platform is relabelled (`basic`); these tests pin that the form and exchange
 * are correct and complete for when it does.
 *
 * The user's password is sent to the tenant host, so the tenant must be
 * normalised, confined to `*.unicommerce.com`, and the password must travel in
 * the request body — never in the URL.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { UnicommerceAdapter } from '../../../../../../src/verticals/inventory/adapters/unicommerce'
import { UnicommerceClient } from '../../../../../../src/verticals/inventory/adapters/unicommerce/client'

afterEach(() => vi.restoreAllMocks())

const TOKEN = { access_token: 'tok', token_type: 'bearer', refresh_token: 'ref', expires_in: 41621 }

function mockHttp() {
  const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKEN })
  const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: TOKEN })
  return { post, get }
}

describe('Unicommerce per-customer tenant', () => {
  const adapter = new UnicommerceAdapter({})

  it('declares tenant, username, password and facility on the credential form (renders once relabelled)', () => {
    const fields = adapter.credentialFields()
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'tenant', type: 'text', required: true }),
        expect.objectContaining({ name: 'username', required: true }),
        expect.objectContaining({ name: 'password', type: 'password', required: true }),
        expect.objectContaining({ name: 'facility', required: false }),
      ]),
    )
  })

  it('exchanges against the normalised tenant host with the password in the body, and stores the tenant', async () => {
    const { post, get } = mockHttp()
    const creds = await adapter.exchangeCredentials({
      tenant: ' https://ACME.unicommerce.com/services/rest/v1 ',
      username: 'ops@acme.example',
      password: 's3cret',
      facility: ' WH1 ',
    })

    expect(get).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0]!
    expect(url).toBe('https://acme.unicommerce.com/oauth/token')
    expect(String(url)).not.toContain('s3cret')
    const form = new URLSearchParams(String(body))
    expect(form.get('grant_type')).toBe('password')
    expect(form.get('client_id')).toBe('my-trusted-client')
    expect(form.get('username')).toBe('ops@acme.example')
    expect(form.get('password')).toBe('s3cret')

    expect(creds.accessToken).toBe('tok')
    expect(creds.refreshToken).toBe('ref')
    expect(creds.expiresAt).toBeInstanceOf(Date)
    expect(creds.extra).toEqual({ tenant: 'acme', facility: 'WH1', refreshToken: 'ref' })
  })

  it.each([
    'acme.unicommerce.com.evil.example',
    'evil.example',
    'https://evil.example/acme.unicommerce.com',
  ])('rejects the foreign host %j without making a request', async (tenant) => {
    const { post, get } = mockHttp()
    await expect(
      adapter.exchangeCredentials({ tenant, username: 'u', password: 'p' }),
    ).rejects.toThrow(/Unicommerce tenant must be a \*\.unicommerce\.com host/)
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('names what is missing and makes no request', async () => {
    const { post, get } = mockHttp()
    await expect(
      adapter.exchangeCredentials({ tenant: ' ', username: 'u', password: 'p' }),
    ).rejects.toThrow(/Unicommerce tenant is required/)
    await expect(
      adapter.exchangeCredentials({ tenant: 'acme', username: ' ', password: 'p' }),
    ).rejects.toThrow(/Unicommerce username is required/)
    await expect(
      adapter.exchangeCredentials({ tenant: 'acme', username: 'u', password: '' }),
    ).rejects.toThrow(/Unicommerce password is required/)
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('builds the client base URL from credentials.extra.tenant', () => {
    const create = vi.spyOn(axios, 'create')
    new UnicommerceClient({ accessToken: 't', extra: { tenant: 'acme', facility: 'WH1' } })
    expect(create).toHaveBeenCalled()
    expect(create.mock.calls[0]![0]!.baseURL).toBe('https://acme.unicommerce.com/services/rest/v1')
  })

  it('refuses a stored tenant outside unicommerce.com before any request is built', () => {
    const create = vi.spyOn(axios, 'create')
    expect(
      () => new UnicommerceClient({ accessToken: 't', extra: { tenant: 'acme.unicommerce.com.evil.example' } }),
    ).toThrow(/Unicommerce tenant must be a \*\.unicommerce\.com host/)
    expect(create).not.toHaveBeenCalled()
  })
})
