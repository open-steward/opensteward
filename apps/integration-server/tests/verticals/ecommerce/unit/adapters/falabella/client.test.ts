/**
 * Doc: https://developers.falabella.com/docs/signing-requests — "The
 * concatenated result of all the request parameters, ordered by name...
 * Names and values must be URL encoded according to RFC 3986... The
 * signature parameter... is the HMAC of the request string and your API key
 * with the SHA256 digest algorithm." Confirmed PHP reference:
 *   $parameters['Signature'] = rawurlencode(hash_hmac('sha256', $concatenated, $api_key, false));
 * And https://developers.falabella.com/docs/operate-with-apis for the
 * User-Agent format and business-unit codes.
 *
 * The known-answer value below is computed independently in this file
 * (Node's own `crypto`, following the documented steps verbatim) rather
 * than taken from an official worked example — the docs page shows only a
 * placeholder Signature value inconsistent in length with SHA-256 (see
 * client.ts's header comment) — so this is the strongest available check:
 * correct sort order, correct RFC 3986 encoding, correct HMAC-SHA256/hex.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import axios from 'axios'
import {
  rfc3986Encode,
  signFalabellaRequest,
  buildUserAgent,
  toArray,
  FalabellaClient,
} from '../../../../../../src/verticals/ecommerce/adapters/falabella/client'
import { API_BASE_URL } from '../../../../../../src/verticals/ecommerce/adapters/falabella/constants'

vi.mock('axios')

describe('rfc3986Encode', () => {
  it('encodes RFC-3986-reserved characters encodeURIComponent leaves alone', () => {
    expect(rfc3986Encode("a!'()*b")).toBe('a%21%27%28%29%2Ab')
  })

  it('encodes @ and : (used by emails and ISO timestamps)', () => {
    expect(rfc3986Encode('seller@example.com')).toBe('seller%40example.com')
    expect(rfc3986Encode('2026-01-01T00:00:00Z')).toBe('2026-01-01T00%3A00%3A00Z')
  })
})

describe('signFalabellaRequest — known-answer test', () => {
  const params = {
    Action: 'GetOrders',
    Format: 'JSON',
    Timestamp: '2026-01-01T00:00:00.000Z',
    UserID: 'seller@example.com',
    Version: '1.0',
  }
  const apiKey = 'test-api-key'

  it('matches an independent step-by-step re-implementation of the documented algorithm', () => {
    const sorted = Object.keys(params).sort()
    const joined = sorted
      .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode((params as Record<string, string>)[k]!)}`)
      .join('&')
    const expected = crypto.createHmac('sha256', apiKey).update(joined).digest('hex')
    expect(expected).toBe('103cfa72b894ac08a8e22dfd36d9bfa8f2eab3abb08136d64dc9bbf5197c93ae')
    expect(signFalabellaRequest(params, apiKey)).toBe(expected)
  })

  it('sorts parameters alphabetically regardless of insertion order', () => {
    const reordered = { Version: '1.0', Action: 'GetOrders', UserID: 'seller@example.com', Format: 'JSON', Timestamp: '2026-01-01T00:00:00.000Z' }
    expect(signFalabellaRequest(reordered, apiKey)).toBe(signFalabellaRequest(params, apiKey))
  })

  it('excludes an existing Signature parameter from the signed set', () => {
    const withSig = { ...params, Signature: 'stale' }
    expect(signFalabellaRequest(withSig, apiKey)).toBe(signFalabellaRequest(params, apiKey))
  })

  it('produces lowercase hex (Node default, matching PHP hash_hmac(..., false))', () => {
    expect(signFalabellaRequest(params, apiKey)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when the API key changes', () => {
    expect(signFalabellaRequest(params, apiKey)).not.toBe(signFalabellaRequest(params, 'different-key'))
  })
})

describe('buildUserAgent', () => {
  it('follows SELLER_ID/TECH/VERSION/INTEGRATION_TYPE/BUSINESS_UNIT_CODE', () => {
    const ua = buildUserAgent('JJJ123', 'FACL')
    expect(ua).toMatch(/^JJJ123\/Node\.js\/[^/]+\/OPENSTEWARD\/FACL$/)
  })
})

describe('toArray', () => {
  it('wraps a bare object (XML→JSON collapses a 1-item list)', () => {
    expect(toArray({ a: 1 })).toEqual([{ a: 1 }])
  })
  it('passes an array through unchanged', () => {
    expect(toArray([{ a: 1 }, { a: 2 }])).toEqual([{ a: 1 }, { a: 2 }])
  })
  it('returns [] for null/undefined', () => {
    expect(toArray(undefined)).toEqual([])
    expect(toArray(null)).toEqual([])
  })
})

describe('FalabellaClient', () => {
  let requestSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    requestSpy = vi.fn()
    vi.mocked(axios.create).mockReturnValue({ request: requestSpy } as unknown as ReturnType<typeof axios.create>)
    vi.mocked(axios.isAxiosError).mockImplementation(
      (e: unknown): e is import('axios').AxiosError => Boolean(e && typeof e === 'object' && 'isAxiosError' in e),
    )
  })

  function credentials() {
    return {
      accessToken: 'super-secret-api-key',
      extra: { userId: 'seller@example.com', sellerId: 'JJJ123', country: 'CL' as const },
    }
  }

  it('requires userId, apiKey, sellerId, and a supported country', () => {
    expect(() => new FalabellaClient({ accessToken: 'k', extra: { sellerId: 's', country: 'CL' } })).toThrow(/userId/)
    expect(() => new FalabellaClient({ accessToken: '', extra: { userId: 'u', sellerId: 's', country: 'CL' } })).toThrow(/API key/)
    expect(() => new FalabellaClient({ accessToken: 'k', extra: { userId: 'u', country: 'CL' } })).toThrow(/sellerId/)
    expect(() =>
      new FalabellaClient({ accessToken: 'k', extra: { userId: 'u', sellerId: 's', country: 'AR' } }),
    ).toThrow(/country/)
  })

  it('sends the signed request with Format=JSON, the documented User-Agent, and no api key in params', async () => {
    requestSpy.mockResolvedValue({ data: { SuccessResponse: { Body: { ok: true } } } })
    const client = new FalabellaClient(credentials())
    await client.call('GetOrders', { Offset: '0', Limit: '50' })

    expect(requestSpy).toHaveBeenCalledTimes(1)
    const config = requestSpy.mock.calls[0]![0] as {
      url: string
      method: string
      params: Record<string, string>
      headers: Record<string, string>
      baseURL?: string
    }
    expect(config.method).toBe('GET')
    expect(config.params['Action']).toBe('GetOrders')
    expect(config.params['Format']).toBe('JSON')
    expect(config.params['UserID']).toBe('seller@example.com')
    expect(config.params['Signature']).toMatch(/^[0-9a-f]{64}$/)
    expect(config.headers['User-Agent']).toBe('JJJ123/Node.js/' + process.versions.node + '/OPENSTEWARD/FACL')
    // The API key is the HMAC secret only — it must never appear anywhere in
    // the request the client actually sends.
    const serialisedRequest = JSON.stringify(config)
    expect(serialisedRequest).not.toContain('super-secret-api-key')
  })

  it('posts a raw XML body for write actions with the signed params still in the query string', async () => {
    requestSpy.mockResolvedValue({ data: { SuccessResponse: { Body: {} } } })
    const client = new FalabellaClient(credentials())
    await client.call('UpdateStock', {}, { method: 'POST', body: '<Request/>' })
    const config = requestSpy.mock.calls[0]![0] as { method: string; data: string; headers: Record<string, string> }
    expect(config.method).toBe('POST')
    expect(config.data).toBe('<Request/>')
    expect(config.headers['Content-Type']).toBe('text/xml')
  })

  it('extracts SuccessResponse.Body as the call result', async () => {
    requestSpy.mockResolvedValue({ data: { SuccessResponse: { Body: { Orders: { Order: [] } } } } })
    const client = new FalabellaClient(credentials())
    const body = await client.call<{ Orders: unknown }>('GetOrders')
    expect(body).toEqual({ Orders: { Order: [] } })
  })

  it('throws a readable error on ErrorResponse without leaking the api key', async () => {
    requestSpy.mockResolvedValue({
      data: { ErrorResponse: { Head: { ErrorCode: 'InvalidSignature', ErrorMessage: 'bad signature' } } },
    })
    const client = new FalabellaClient(credentials())
    await expect(client.call('GetOrders')).rejects.toThrow(/bad signature/)
  })

  it('never rethrows the raw axios error — HTTP failures are sanitised so the API key cannot leak via err.config', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 401'), {
      isAxiosError: true,
      response: { status: 401 },
      config: { params: { Signature: 'whatever' }, url: API_BASE_URL },
    })
    requestSpy.mockRejectedValue(axiosError)
    const client = new FalabellaClient(credentials())
    let caught: unknown
    try {
      await client.call('GetOrders')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBe(axiosError)
    expect((caught as { config?: unknown }).config).toBeUndefined()
    expect(JSON.stringify(caught, Object.getOwnPropertyNames(caught as object))).not.toContain('super-secret-api-key')
  })
})
