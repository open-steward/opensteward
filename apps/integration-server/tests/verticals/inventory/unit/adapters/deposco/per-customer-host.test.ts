/**
 * Deposco's integration API lives at
 * `https://{instance}.deposco.com/integration/{tenantCode}` with HTTP Basic
 * credentials issued per merchant. The instance host and the tenant code are
 * separate values (integrators ask for "Deposco URL" and "Tenant Code"
 * independently); the adapter used to assume the host was the tenant code.
 *
 * Both are collected by `credentialFields()`, which the Connect page renders
 * once the platform is relabelled from `oauth2` to `basic`. The host receives
 * the Basic credentials, so anything outside deposco.com is refused.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { DeposcoAdapter } from '../../../../../../src/verticals/inventory/adapters/deposco/index'
import { normaliseDeposcoInstance } from '../../../../../../src/verticals/inventory/adapters/deposco/auth'

function fakeHttp() {
  return {
    get: vi.fn().mockResolvedValue({ data: { ProductList: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  }
}

const FIELDS = {
  deposcoUrl: 'https://WMS7.deposco.com/integration/ACME',
  tenantCode: ' ACME ',
  username: 'api-user',
  password: 'pw',
}
const STORED = {
  accessToken: Buffer.from('api-user:pw').toString('base64'),
  extra: { instance: 'wms7', tenantCode: 'ACME', businessUnit: 'DEFAULT' },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseDeposcoInstance', () => {
  it.each([
    ['acme', 'acme'],
    ['acme.deposco.com', 'acme'],
    ['https://ACME.deposco.com/integration/ACME', 'acme'],
  ])('%s → %s', (input, want) => {
    expect(normaliseDeposcoInstance(input)).toBe(want)
  })

  it('rejects blanks with a message naming the field', () => {
    for (const v of ['', '   ', undefined]) {
      expect(() => normaliseDeposcoInstance(v)).toThrow(/Deposco URL is required/)
    }
  })

  it.each(['evil.example.com', 'acme.deposco.com.evil.example', 'a.b.deposco.com'])(
    'rejects %s — Basic credentials must not leave deposco.com',
    (input) => {
      expect(() => normaliseDeposcoInstance(input)).toThrow(/Deposco URL must be a \*\.deposco\.com host/)
    },
  )
})

describe('DeposcoAdapter with a per-customer instance host', () => {
  const adapter = new DeposcoAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

  it('declares the Deposco URL on the credential form (renders once relabelled basic)', () => {
    expect(adapter.credentialFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'deposcoUrl', required: true }),
        expect.objectContaining({ name: 'tenantCode', required: true }),
        expect.objectContaining({ name: 'username', required: true }),
        expect.objectContaining({ name: 'password', required: true, type: 'password' }),
      ]),
    )
  })

  it('stores the normalised instance and tenant code in extra', async () => {
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(creds).toEqual(STORED)
  })

  it.each([
    [{ ...FIELDS, deposcoUrl: '' }, /Deposco URL is required/],
    [{ ...FIELDS, deposcoUrl: 'acme.deposco.com.evil.example' }, /Deposco URL must be a \*\.deposco\.com host/],
    [{ ...FIELDS, tenantCode: '' }, /Deposco tenant code is required/],
    [{ ...FIELDS, tenantCode: 'ACME/../other' }, /Deposco tenant code must be a single code/],
    [{ ...FIELDS, password: '' }, /API password is required/],
  ])('rejects %o', async (fields, message) => {
    await expect(adapter.exchangeCredentials(fields)).rejects.toThrow(message)
  })

  it('calls the API on the instance and tenant code stored with the credentials', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await adapter.listProducts(STORED, {})
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://wms7.deposco.com/integration/ACME',
    )
    expect(http.get).toHaveBeenCalledTimes(1)
  })

  it('sends no request when the stored instance is missing or foreign', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await expect(
      adapter.listProducts({ ...STORED, extra: { tenantCode: 'ACME' } }, {}),
    ).rejects.toThrow(/Deposco URL is required/)
    await expect(
      adapter.listProducts({ ...STORED, extra: { ...STORED.extra, instance: 'evil.example.com' } }, {}),
    ).rejects.toThrow(/Deposco URL must be a \*\.deposco\.com host/)
    expect(create).not.toHaveBeenCalled()
    expect(http.get).not.toHaveBeenCalled()
  })
})
