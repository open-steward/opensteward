/**
 * Toast authentication: POST /authentication/v1/authentication/login with a
 * JSON `AuthenticationRequest` (`clientId`, `clientSecret`, `userAccessType`:
 * "Always include the `userAccessType` value and set it to
 * `TOAST_MACHINE_CLIENT`."), answered by an `AuthenticationResponse` whose
 * `token` holds `accessToken` and `expiresIn`.
 * https://doc.toasttab.com/openapi/authentication/operation/authenticationLoginPost/
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ToastAdapter } from '../../../../../../src/verticals/ecommerce/adapters/toast/index'

function loginServer() {
  const post = vi.spyOn(axios, 'post').mockResolvedValue({
    data: {
      token: { tokenType: 'Bearer', scope: null, expiresIn: 86400, accessToken: 'jwt-token' },
      status: 'SUCCESS',
    },
  })
  return post
}

afterEach(() => vi.restoreAllMocks())

describe('Toast Connect form', () => {
  it('asks for the client credentials and the restaurant GUID', () => {
    const fields = new ToastAdapter().credentialFields()
    expect(fields.filter((f) => f.required).map((f) => f.name)).toEqual([
      'clientId',
      'clientSecret',
      'restaurantId',
    ])
  })

  it('exchanges them with the documented JSON login, not an RFC 6749 form', async () => {
    const post = loginServer()
    const creds = await new ToastAdapter().exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'secret',
      restaurantId: 'rest-1',
    })
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0]!
    expect(url).toBe('https://ws-api.toasttab.com/authentication/v1/authentication/login')
    expect(body).toEqual({
      clientId: 'cid',
      clientSecret: 'secret',
      userAccessType: 'TOAST_MACHINE_CLIENT',
    })
    expect(creds.accessToken).toBe('jwt-token')
    expect(creds.extra).toEqual({
      clientId: 'cid',
      clientSecret: 'secret',
      restaurantId: 'rest-1',
      environment: 'production',
    })
  })

  it('stores the expiry from expiresIn, which is in seconds', async () => {
    loginServer()
    const before = Date.now()
    const creds = await new ToastAdapter().exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'secret',
      restaurantId: 'rest-1',
    })
    const after = Date.now()
    const at = creds.expiresAt!.getTime()
    expect(at).toBeGreaterThanOrEqual(before + 86_400_000)
    expect(at).toBeLessThanOrEqual(after + 86_400_000)
  })

  it('refuses an environment that is not one of the select options, before sending anything', async () => {
    const post = loginServer()
    for (const environment of ['staging', 'constructor', 'toString']) {
      await expect(
        new ToastAdapter().exchangeCredentials({
          clientId: 'cid',
          clientSecret: 'secret',
          restaurantId: 'rest-1',
          environment,
        }),
      ).rejects.toThrow(/Unknown Toast environment/)
    }
    expect(post).not.toHaveBeenCalled()
  })

  it('logs a stored non-option environment in against production, never an inherited key', async () => {
    const post = loginServer()
    await new ToastAdapter().refreshCredentials({
      accessToken: 'old',
      extra: {
        clientId: 'cid',
        clientSecret: 'secret',
        restaurantId: 'rest-1',
        environment: 'constructor',
      },
    })
    expect(post.mock.calls[0]![0]).toBe(
      'https://ws-api.toasttab.com/authentication/v1/authentication/login',
    )
  })

  it('refuses a form without the restaurant GUID before sending anything', async () => {
    const post = loginServer()
    await expect(
      new ToastAdapter().exchangeCredentials({ clientId: 'cid', clientSecret: 'secret' }),
    ).rejects.toThrow(/Restaurant GUID/)
    expect(post).not.toHaveBeenCalled()
  })

  it('logs a sandbox connection in against the sandbox host, on exchange and on refresh', async () => {
    const post = loginServer()
    const adapter = new ToastAdapter()
    await adapter.exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'secret',
      restaurantId: 'rest-1',
      environment: 'sandbox',
    })
    await adapter.refreshCredentials({
      accessToken: 'old',
      extra: {
        clientId: 'cid',
        clientSecret: 'secret',
        restaurantId: 'rest-1',
        environment: 'sandbox',
      },
    })
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      'https://ws-sandbox-api.toasttab.com/authentication/v1/authentication/login',
      'https://ws-sandbox-api.toasttab.com/authentication/v1/authentication/login',
    ])
  })
})
