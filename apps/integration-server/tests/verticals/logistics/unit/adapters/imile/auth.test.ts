/**
 * iMile authentication: customerId + sign key -> POST /auth/accessToken/grant.
 *
 * "Access Token" (https://developer.imile.com/apis/details/1825742952067575809):
 *   "When you first call this API, it checks your credentials (Customer ID and
 *    the Sign Key) and returns an access token if the information is valid."
 *   "Note: Token expires every Two hours once it's generated."
 *   "Production Environment: https://openapi.imile.com"
 * Signature rules (https://developer.imile.com/apis/details/1826162720868216833):
 *   "PS: There is no need to splice the accessToken field and value when
 *    calling the get token interface."
 */
import { createHash } from 'crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { IMileAdapter } from '../../../../../../src/verticals/logistics/adapters/imile/index'
import { buildSign } from '../../../../../../src/verticals/logistics/adapters/imile/client'
import { ACCESS_TOKEN_RESPONSE, SIGNATURE_EXAMPLE } from './fixtures'

const NOW = 1_760_000_000_000

let post: ReturnType<typeof vi.fn>
let create: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  post = vi.fn(async () => ({ data: ACCESS_TOKEN_RESPONSE }))
  create = vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('iMile signature', () => {
  it('reproduces the documented worked example (sign 45858AAB…)', () => {
    const { secretKey, publicParams, param, sign } = SIGNATURE_EXAMPLE
    expect(buildSign(publicParams, JSON.stringify(param), secretKey)).toBe(sign)
  })
})

describe('iMile credential form', () => {
  it('asks for the documented Customer ID and Sign Key', () => {
    const fields = new IMileAdapter().credentialFields()
    expect(fields.map((f) => [f.name, f.type, f.required])).toEqual([
      ['customerId', 'text', true],
      ['signKey', 'password', true],
    ])
  })

  it('has no OAuth redirect', () => {
    expect(() => new IMileAdapter().getAuthUrl('state')).toThrow(/credential form/)
  })

  it('refuses an authorization-code exchange', async () => {
    await expect(new IMileAdapter().exchangeCode('code', 'https://x/cb')).rejects.toThrow(
      /no OAuth redirect/,
    )
    expect(post).not.toHaveBeenCalled()
  })
})

describe('iMile exchangeCredentials', () => {
  it('grants a token at POST /auth/accessToken/grant on the production host', async () => {
    await new IMileAdapter().exchangeCredentials({ customerId: 'C2102192601', signKey: 'key-1' })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://openapi.imile.com/' }),
    )
    expect(post).toHaveBeenCalledTimes(1)
    const [path, body] = post.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe('auth/accessToken/grant')
    expect(body).toEqual({
      customerId: 'C2102192601',
      format: 'json',
      signMethod: 'MD5',
      timeZone: '+0',
      timestamp: String(NOW),
      version: '1.0.0',
      param: { grantType: 'clientCredential' },
      sign: expect.any(String),
    })
    expect(body).not.toHaveProperty('accessToken')
  })

  it('signs the grant without accessToken, per the documented concatenation', async () => {
    await new IMileAdapter().exchangeCredentials({ customerId: 'C2102192601', signKey: 'key-1' })
    const body = post.mock.calls[0]![1] as Record<string, unknown>
    const spliced =
      'key-1' +
      `customerIdC2102192601formatjsonsignMethodMD5timeZone+0timestamp${NOW}version1.0.0` +
      '{"grantType":"clientCredential"}' +
      'key-1'
    const expected = createHash('md5').update(spliced, 'utf8').digest('hex').toUpperCase()
    expect(body.sign).toBe(expected)
  })

  it('stores the token, its expiry from expiresIn, and the inputs needed to re-grant', async () => {
    const creds = await new IMileAdapter().exchangeCredentials({
      customerId: ' C2102192601 ',
      signKey: ' key-1 ',
    })
    expect(creds.accessToken).toBe('31ecbd50-1ef8-4ce1-97e1-4a518e0785f9')
    expect(creds.expiresAt).toEqual(new Date(NOW + 7200 * 1000))
    expect(creds.extra).toEqual({ customerId: 'C2102192601', signKey: 'key-1' })
  })

  it('requires both fields and sends nothing without them', async () => {
    await expect(
      new IMileAdapter().exchangeCredentials({ customerId: 'C2102192601', signKey: '' }),
    ).rejects.toThrow(/Sign Key is required/)
    await expect(
      new IMileAdapter().exchangeCredentials({ customerId: '', signKey: 'key-1' }),
    ).rejects.toThrow(/Customer ID is required/)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a non-200 response code with iMile’s message', async () => {
    post.mockResolvedValueOnce({
      data: { code: '403', message: 'customerId does not exist', traceId: 't1' },
    })
    await expect(
      new IMileAdapter().exchangeCredentials({ customerId: 'C1', signKey: 'k' }),
    ).rejects.toMatchObject({
      imileCode: '403',
      message: expect.stringMatching(/403.*customerId does not exist/),
    })
  })

  it('rejects a 200 response that carries no token or expiry', async () => {
    post.mockResolvedValueOnce({ data: { code: '200', message: 'success', data: {} } })
    await expect(
      new IMileAdapter().exchangeCredentials({ customerId: 'C1', signKey: 'k' }),
    ).rejects.toThrow(/accessToken/)
  })

  it('rejects a grant whose token is present but expiresIn is missing', async () => {
    post.mockResolvedValueOnce({
      data: { code: '200', message: 'success', data: { accessToken: 'tok-1' } },
    })
    await expect(
      new IMileAdapter().exchangeCredentials({ customerId: 'C1', signKey: 'k' }),
    ).rejects.toThrow(/expiresIn/)
  })

  it('rejects a grant whose expiresIn is not the documented number', async () => {
    post.mockResolvedValueOnce({
      data: { code: '200', message: 'success', data: { accessToken: 'tok-1', expiresIn: '7200' } },
    })
    await expect(
      new IMileAdapter().exchangeCredentials({ customerId: 'C1', signKey: 'k' }),
    ).rejects.toThrow(/expiresIn/)
  })

  it('rejects a grant whose accessToken is empty', async () => {
    post.mockResolvedValueOnce({
      data: { code: '200', message: 'success', data: { accessToken: '', expiresIn: 7200 } },
    })
    await expect(
      new IMileAdapter().exchangeCredentials({ customerId: 'C1', signKey: 'k' }),
    ).rejects.toThrow(/accessToken/)
  })
})

describe('iMile refreshCredentials', () => {
  it('re-grants from the stored customerId and sign key', async () => {
    const refreshed = await new IMileAdapter().refreshCredentials({
      accessToken: 'old-token',
      expiresAt: new Date(NOW - 1000),
      extra: { customerId: 'C2102192601', signKey: 'key-1' },
    })
    const body = post.mock.calls[0]![1] as Record<string, unknown>
    expect(post.mock.calls[0]![0]).toBe('auth/accessToken/grant')
    expect(body.customerId).toBe('C2102192601')
    expect(body).not.toHaveProperty('accessToken')
    expect(refreshed).toEqual({
      accessToken: '31ecbd50-1ef8-4ce1-97e1-4a518e0785f9',
      expiresAt: new Date(NOW + 7200 * 1000),
      extra: { customerId: 'C2102192601', signKey: 'key-1' },
    })
  })

  it('asks for a reconnect when the connection predates the sign-key form', async () => {
    await expect(
      new IMileAdapter().refreshCredentials({ accessToken: 'C2102192601:secret' }),
    ).rejects.toThrow(/reconnect/i)
    expect(post).not.toHaveBeenCalled()
  })

  it.each([
    ['only a customerId', { customerId: 'C2102192601' }],
    ['only a sign key', { signKey: 'key-1' }],
    ['an empty sign key', { customerId: 'C2102192601', signKey: '' }],
    ['an empty customerId', { customerId: '', signKey: 'key-1' }],
  ])('asks for a reconnect when extra holds %s', async (_label, extra) => {
    await expect(
      new IMileAdapter().refreshCredentials({ accessToken: 'old-token', extra }),
    ).rejects.toThrow(/reconnect/i)
    expect(post).not.toHaveBeenCalled()
  })
})
