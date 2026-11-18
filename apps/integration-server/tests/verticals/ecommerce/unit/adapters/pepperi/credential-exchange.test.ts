/**
 * Pepperi credential exchange: admin email + password → APIToken.
 *
 * `GET /company/apitoken` with HTTP Basic auth (admin email:password),
 * response `{ APIToken, BaseURI }` — confirmed at
 * https://developer.pepperi.com/api-reference/company-resource/get-company-api-token/
 * and https://developer.pepperi.com/first-steps/authentication/. Only the
 * resulting APIToken (and BaseURI/consumerKey) are ever persisted — never
 * the admin password.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { PepperiAdapter } from '../../../../../../src/verticals/ecommerce/adapters/pepperi/index'

afterEach(() => vi.restoreAllMocks())

describe('PepperiAdapter.exchangeCredentials', () => {
  it('exchanges admin email/password for an APIToken via GET /company/apitoken with HTTP Basic auth', async () => {
    const get = vi.fn(async (url: string, config?: { headers?: Record<string, string> }) => {
      expect(url).toBe('https://api.pepperi.com/v1.0/company/apitoken')
      const auth = config?.headers?.['Authorization']
      expect(auth).toBe(`Basic ${Buffer.from('admin@acme.example:hunter2').toString('base64')}`)
      return { data: { APIToken: 'tok_abc123', BaseURI: 'https://api.pepperi.com/v1.0' } }
    })
    vi.spyOn(axios, 'get').mockImplementation(get as never)

    const adapter = new PepperiAdapter()
    const creds = await adapter.exchangeCredentials!({
      adminEmail: 'admin@acme.example',
      adminPassword: 'hunter2',
      consumerKey: 'ck_xyz',
    })

    expect(get).toHaveBeenCalledTimes(1)
    expect(creds.accessToken).toBe('tok_abc123')
    expect(creds.extra).toMatchObject({ consumerKey: 'ck_xyz', baseUri: 'https://api.pepperi.com/v1.0' })
    // The admin password must never be persisted onto the stored credentials.
    expect(JSON.stringify(creds)).not.toContain('hunter2')
  })

  it('requires all three fields', async () => {
    const adapter = new PepperiAdapter()
    await expect(
      adapter.exchangeCredentials!({ adminEmail: '', adminPassword: '', consumerKey: '' }),
    ).rejects.toThrow(/required/i)
  })

  it('raises a descriptive error when the token endpoint rejects the credentials', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { response: { status: 401 } }),
    )
    const adapter = new PepperiAdapter()
    await expect(
      adapter.exchangeCredentials!({
        adminEmail: 'admin@acme.example',
        adminPassword: 'wrong',
        consumerKey: 'ck_xyz',
      }),
    ).rejects.toThrow(/401/)
  })
})
