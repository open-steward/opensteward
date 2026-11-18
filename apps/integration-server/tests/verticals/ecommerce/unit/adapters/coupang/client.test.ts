/**
 * Coupang's first-party signing examples
 * (https://developers.coupang.com/en/getting-started/creating-hmac-signature):
 *
 *   $datetime = date("ymd").'T'.date("His").'Z';           (GMT)
 *   $message  = $datetime.$method.$path.$query;
 *   "CEA algorithm=HmacSHA256, access-key=".$accesskey.", signed-date=".$datetime.", signature=".$signature
 *
 * and the Python example signs `urllib.parse.urlencode({...})`, then sends
 * that same string as the query.
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import axios, { type InternalAxiosRequestConfig } from 'axios'
import {
  buildAuthorizationHeader,
  formatDatetime,
  serializeQuery,
} from '../../../../../../src/verticals/ecommerce/adapters/coupang/auth'
import {
  CoupangClient,
  parseCoupangJson,
} from '../../../../../../src/verticals/ecommerce/adapters/coupang/client'
import { CREDS } from './fake'

describe('Coupang signing', () => {
  it("formats signed-date as yyMMdd'T'HHmmss'Z' in UTC", () => {
    expect(formatDatetime(new Date('2018-08-09T01:02:03Z'))).toBe('180809T010203Z')
  })

  it('serialises the query in the order given, form-encoded', () => {
    expect(
      serializeQuery({
        createdAtFrom: '2018-08-09',
        createdAtTo: '2018-08-09',
        status: 'UC',
        skip: undefined,
      }),
    ).toBe('createdAtFrom=2018-08-09&createdAtTo=2018-08-09&status=UC')
    expect(serializeQuery({ createdAtFrom: '2025-07-21+09:00' })).toBe(
      'createdAtFrom=2025-07-21%2B09%3A00',
    )
  })

  it('signs datetime + method + path + query with HMAC-SHA256', () => {
    const date = new Date('2018-08-09T01:02:03Z')
    const path = '/v2/providers/openapi/apis/api/v4/vendors/A00012345/returnRequests'
    const query = 'createdAtFrom=2018-08-09&createdAtTo=2018-08-09&status=UC'
    const expected = createHmac('sha256', 'secret')
      .update(`180809T010203ZGET${path}${query}`)
      .digest('hex')
    expect(buildAuthorizationHeader('ak', 'secret', 'get', path, query, date)).toBe(
      `CEA algorithm=HmacSHA256, access-key=ak, signed-date=180809T010203Z, signature=${expected}`,
    )
  })
})

describe('CoupangClient', () => {
  async function send(params: Record<string, unknown>, body: string) {
    const client = new CoupangClient(CREDS)
    let seen: InternalAxiosRequestConfig | undefined
    const http = (client as unknown as { http: { defaults: { adapter: unknown } } }).http
    http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      seen = config
      return { data: body, status: 200, statusText: 'OK', headers: {}, config }
    }
    const data = await client.get<unknown>('/v2/providers/x/ordersheets', params)
    return { data, seen: seen! }
  }

  it('signs exactly the query string it sends', async () => {
    const { seen } = await send(
      { status: 'ACCEPT', createdAtFrom: '2025-07-21+09:00', maxPerPage: 50 },
      '{}',
    )
    const uri = axios.getUri(seen)
    const query = uri.slice(uri.indexOf('?') + 1)
    expect(query).toBe('status=ACCEPT&createdAtFrom=2025-07-21%2B09%3A00&maxPerPage=50')
    const auth = String(seen.headers['Authorization'])
    const m =
      /^CEA algorithm=HmacSHA256, access-key=access-key, signed-date=(\d{6}T\d{6}Z), signature=([0-9a-f]{64})$/.exec(
        auth,
      )
    expect(m).not.toBeNull()
    const expected = createHmac('sha256', 'secret')
      .update(`${m![1]}GET/v2/providers/x/ordersheets${query}`)
      .digest('hex')
    expect(m![2]).toBe(expected)
  })

  it('keeps an id past Number.MAX_SAFE_INTEGER as its exact digits', async () => {
    const { data } = await send(
      {},
      '{"data":{"shipmentBoxId":642538970006401429,"orderId":500000596,"units":1.5}}',
    )
    expect(data).toEqual({
      data: { shipmentBoxId: '642538970006401429', orderId: 500000596, units: 1.5 },
    })
  })

  it('parseCoupangJson leaves safe numbers alone', () => {
    expect(parseCoupangJson('[1, -2, 3.25, 9007199254740993]')).toEqual([
      1,
      -2,
      3.25,
      '9007199254740993',
    ])
  })
})
