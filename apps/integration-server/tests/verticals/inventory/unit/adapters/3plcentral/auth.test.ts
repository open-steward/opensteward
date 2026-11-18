import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ThreePlCentralAdapter } from '../../../../../../src/verticals/inventory/adapters/3plcentral/index'

/**
 * The vendor Postman collection ("POST_Auth_Token",
 * https://developer.3plcentral.com/api/collections/8399762/SVn3tFsv?segregateAuth=true&versionTag=latest)
 * sends a JSON body with Basic client auth; `tpl` is marked optional.
 */

afterEach(() => vi.restoreAllMocks())

const adapter = new ThreePlCentralAdapter({} as never)
const base = { clientId: 'cid', clientSecret: 'sec', userLoginId: '42' }

describe('3plcentral credential connection', () => {
  it('posts a JSON client_credentials body with Basic client auth', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 't1' } } as never)

    const creds = await adapter.exchangeCredentials({ ...base, tplKey: 'abc' })

    const [url, body, cfg] = post.mock.calls[0]!
    expect(url).toBe('https://secure-wms.com/AuthServer/api/Token')
    expect(body).toEqual({ grant_type: 'client_credentials', user_login_id: '42', tpl: '{abc}' })
    const headers = (cfg as { headers: Record<string, string> }).headers
    expect(headers['Content-Type']).toMatch(/^application\/json/)
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from('cid:sec').toString('base64')}`)
    expect(creds.accessToken).toBe('t1')
  })

  it('omits tpl when no TPL key is given', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 't1' } } as never)
    await adapter.exchangeCredentials(base)
    expect(post.mock.calls[0]![1]).toEqual({
      grant_type: 'client_credentials',
      user_login_id: '42',
    })
  })

  it('collects and keeps the customerId / facilityId the read methods need, across refresh', async () => {
    const names = adapter.credentialFields().map((f) => f.name)
    expect(names).toEqual(expect.arrayContaining(['customerId', 'facilityId']))

    vi.spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { access_token: 't1' } } as never)
      .mockResolvedValueOnce({ data: { access_token: 't2' } } as never)
    const first = await adapter.exchangeCredentials({ ...base, customerId: '7', facilityId: '3' })
    expect(first.extra).toMatchObject({ customerId: '7', facilityId: '3' })

    const second = await adapter.refreshCredentials(first)
    expect(second.accessToken).toBe('t2')
    expect(second.extra).toMatchObject({ customerId: '7', facilityId: '3', clientSecret: 'sec' })
  })

  it('rejects a form missing the user login id without calling the API', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCredentials({ clientId: 'cid', clientSecret: 'sec' }),
    ).rejects.toThrow(/userLoginId/)
    expect(post).not.toHaveBeenCalled()
  })
})
