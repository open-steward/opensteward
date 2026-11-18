/**
 * Xentral is one instance per customer at `https://{xentralId}.xentral.biz`
 * (official OpenAPI `servers`), authenticated with a Personal Access Token.
 * There is no browser OAuth, so the instance and token are collected through
 * `credentialFields()` / `exchangeCredentials()`.
 *
 * NOTE: metadata still labels xentral `auth_type: 'oauth2'`, which makes the
 * Connect page skip `credentialFields()`. The form renders once the platform is
 * relabelled `api_key`; these tests pin that the form and exchange are correct
 * and complete for when it does.
 *
 * The PAT is sent to the instance host on every request, so the stored
 * instance must be normalised and confined to `*.xentral.biz`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { XentralAdapter } from '../../../../../../src/verticals/inventory/adapters/xentral'
import { XentralClient } from '../../../../../../src/verticals/inventory/adapters/xentral/client'

afterEach(() => vi.restoreAllMocks())

describe('Xentral per-customer instance', () => {
  const adapter = new XentralAdapter({})

  it('declares the instance and the token on the credential form (renders once relabelled api_key)', () => {
    const fields = adapter.credentialFields()
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'xentralId', type: 'text', required: true }),
        expect.objectContaining({ name: 'accessToken', type: 'password', required: true }),
      ]),
    )
  })

  it.each([
    ['acme', 'acme'],
    ['acme.xentral.biz', 'acme'],
    ['https://Acme.xentral.biz/api/v1/products', 'acme'],
    ['  ACME.XENTRAL.BIZ/ ', 'acme'],
  ])('stores the normalised instance for %j', async (input, want) => {
    const creds = await adapter.exchangeCredentials({ xentralId: input, accessToken: ' pat-123 ' })
    expect(creds).toEqual({ accessToken: 'pat-123', extra: { xentralId: want } })
  })

  it.each([
    'acme.xentral.biz.evil.example',
    'evil.example',
    'https://evil.example/acme.xentral.biz',
    'acme.xentral.biz:8443',
  ])('rejects the foreign host %j', async (input) => {
    await expect(
      adapter.exchangeCredentials({ xentralId: input, accessToken: 'pat' }),
    ).rejects.toThrow(/Xentral instance must be a \*\.xentral\.biz host/)
  })

  it('rejects an instance id with characters a subdomain cannot hold', async () => {
    await expect(
      adapter.exchangeCredentials({ xentralId: 'evil@acme', accessToken: 'pat' }),
    ).rejects.toThrow(/Xentral instance ID may only contain letters, digits and hyphens/)
  })

  it('names what is missing when a field is blank', async () => {
    await expect(
      adapter.exchangeCredentials({ xentralId: '  ', accessToken: 'pat' }),
    ).rejects.toThrow(/Xentral instance ID is required/)
    await expect(
      adapter.exchangeCredentials({ xentralId: 'acme', accessToken: '  ' }),
    ).rejects.toThrow(/Xentral personal access token is required/)
  })

  it('builds the client base URL from credentials.extra', () => {
    const create = vi.spyOn(axios, 'create')
    new XentralClient({ accessToken: 't', extra: { xentralId: 'acme' } })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]![0]!.baseURL).toBe('https://acme.xentral.biz')
  })

  it('refuses a stored instance outside xentral.biz before any request is built', () => {
    const create = vi.spyOn(axios, 'create')
    expect(
      () => new XentralClient({ accessToken: 't', extra: { xentralId: 'acme.xentral.biz.evil.example' } }),
    ).toThrow(/Xentral instance must be a \*\.xentral\.biz host/)
    expect(create).not.toHaveBeenCalled()
  })
})
