/**
 * getTrackingEvents calls "Order Track Query (Single)", POST /client/track/getOne
 * (https://developer.imile.com/apis/details/1826891449751908354), whose body is
 *   orderType (required) "1: Waybill number 2: Customer order number"
 *   language  (required) "1: Chinese 2: English 3: Spanish 4: Portuguese"
 *   orderNo   (required) "The order number you want to query"
 * inside the signed envelope of the Introduction document
 * (https://developer.imile.com/apis/details/1825830683510648833), where
 * accessToken is "Temporary token, except the interface for obtaining the
 * token, all other interfaces are required".
 */
import { createHash } from 'crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { IMileAdapter } from '../../../../../../src/verticals/logistics/adapters/imile/index'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { TRACK_GET_ONE_RESPONSE } from './fixtures'

const NOW = 1_760_000_000_000
const creds = {
  accessToken: '2ad5d704-c35a-4357-bc15-151072a0c7db',
  expiresAt: new Date(NOW + 3_600_000),
  extra: { customerId: 'C2102192601', signKey: 'key-1' },
}

let post: ReturnType<typeof vi.fn>
let create: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  post = vi.fn(async () => ({ data: TRACK_GET_ONE_RESPONSE }))
  create = vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('iMile getTrackingEvents request', () => {
  it('posts the signed envelope to client/track/getOne on the production host', async () => {
    await new IMileAdapter().getTrackingEvents(creds, '6063024371258')

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://openapi.imile.com/' }),
    )
    expect(post).toHaveBeenCalledTimes(1)
    const [path, body] = post.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe('client/track/getOne')
    expect(body).toEqual({
      customerId: 'C2102192601',
      accessToken: '2ad5d704-c35a-4357-bc15-151072a0c7db',
      format: 'json',
      signMethod: 'MD5',
      timeZone: '+0',
      timestamp: String(NOW),
      version: '1.0.0',
      param: { orderType: '1', language: '2', orderNo: '6063024371258' },
      sign: expect.any(String),
    })
  })

  it('signs accessToken..version sorted, then the param JSON, wrapped in the sign key', async () => {
    await new IMileAdapter().getTrackingEvents(creds, '6063024371258')
    const body = post.mock.calls[0]![1] as Record<string, unknown>
    const spliced =
      'key-1' +
      'accessToken2ad5d704-c35a-4357-bc15-151072a0c7db' +
      'customerIdC2102192601formatjsonsignMethodMD5timeZone+0' +
      `timestamp${NOW}version1.0.0` +
      '{"orderType":"1","language":"2","orderNo":"6063024371258"}' +
      'key-1'
    expect(body.sign).toBe(createHash('md5').update(spliced, 'utf8').digest('hex').toUpperCase())
  })

  it('refuses a connection without the stored customerId and sign key, sending nothing', async () => {
    await expect(
      new IMileAdapter().getTrackingEvents({ accessToken: 'C2102192601:secret' }, '6063024371258'),
    ).rejects.toThrow(/reconnect/i)
    expect(post).not.toHaveBeenCalled()
  })

  it.each([
    ['only a customerId', { customerId: 'C2102192601' }],
    ['only a sign key', { signKey: 'key-1' }],
  ])('refuses a connection whose extra holds %s', async (_label, extra) => {
    await expect(
      new IMileAdapter().getTrackingEvents({ accessToken: 'tok', extra }, '6063024371258'),
    ).rejects.toThrow(/reconnect/i)
    expect(post).not.toHaveBeenCalled()
  })

  it('surfaces a non-200 response code', async () => {
    post.mockResolvedValueOnce({ data: { code: '22185', message: 'Waybill Number not exists' } })
    await expect(
      new IMileAdapter().getTrackingEvents(creds, '0000000000000'),
    ).rejects.toMatchObject({ imileCode: '22185' })
  })
})

describe('iMile getTrackingEvents response', () => {
  it('returns canonical events from the documented example', async () => {
    const events = await new IMileAdapter().getTrackingEvents(creds, '6063024371258')
    expect(events).toHaveLength(1)
    for (const e of events) TrackingEventSchema.parse(e)
    expect(events[0]).toMatchObject({
      trackingNumber: '6063024371258',
      carrierId: 'imile',
      description: '【Mexico Return Center】Shipment received.',
      occurredAt: new Date('2024-08-06T14:08:39.000Z'),
    })
  })

  it('returns no events when the response has no data', async () => {
    post.mockResolvedValueOnce({ data: { code: '200', message: 'success' } })
    expect(await new IMileAdapter().getTrackingEvents(creds, '6063024371258')).toEqual([])
  })
})
