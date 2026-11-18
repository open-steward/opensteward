/**
 * iMile list methods refuse before sending anything.
 *
 * iMile's public Open API catalog (developer.imile.com, 36 documents,
 * fetched 2026-09-24) documents no endpoint that lists an account's
 * shipments, orders or tracking events:
 *   - POST /client/track/list ("Track Order(Batch)") requires `orderNo`
 *     (an array of named waybills) and has no page/pageSize parameter.
 *   - POST /client/order/queryTransferOrders is documented as "used to query
 *     the orders that can be transferred", a filtered subset.
 * None of shipment/list, order/list, tracking/list, shipment/query or
 * order/query is in the catalog, so listShipments, listOrders,
 * listTrackingEvents, getShipment and getOrder refuse with 501.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { IMileAdapter } from '../../../../../../src/verticals/logistics/adapters/imile/index'

const creds = { accessToken: 'C2102192601', refreshToken: 'secret' }

let post: ReturnType<typeof vi.fn>
let get: ReturnType<typeof vi.fn>
let create: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  post = vi.fn(async () => ({ data: { code: '200', data: [] } }))
  get = vi.fn(async () => ({ data: {} }))
  create = vi.spyOn(axios, 'create').mockReturnValue({
    post,
    get,
    defaults: { headers: { common: {} } },
  } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function refusal(run: () => Promise<unknown>): Promise<unknown> {
  return run().then(
    () => {
      throw new Error('expected a refusal')
    },
    (err: unknown) => err,
  )
}

describe('iMile list methods: no documented collection', () => {
  const adapter = new IMileAdapter()

  const cases: Array<[string, () => Promise<unknown>, RegExp]> = [
    [
      'listShipments',
      () => adapter.listShipments(creds, { page: 1, limit: 50 }),
      /iMile cannot list shipments/,
    ],
    [
      'listOrders',
      () => adapter.listOrders(creds, { page: 1, limit: 50 }),
      /iMile cannot list orders/,
    ],
    [
      'listTrackingEvents',
      () => adapter.listTrackingEvents(creds, { page: 1, limit: 50 }),
      /iMile cannot list tracking events: .*orderNo/,
    ],
  ]

  for (const [name, run, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const err = await refusal(run)
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect((err as Error).message).toMatch(message)
      expect(create).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
    })

    it(`${name} refuses with updatedAfter too`, async () => {
      const call = name as 'listShipments' | 'listOrders' | 'listTrackingEvents'
      const err = await refusal(() =>
        adapter[call](creds, {
          page: 2,
          limit: 10,
          updatedAfter: new Date('2026-01-01T00:00:00Z'),
        }),
      )
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(post).not.toHaveBeenCalled()
    })
  }
})

describe('iMile record lookups with no documented endpoint', () => {
  const adapter = new IMileAdapter()

  it('getShipment throws 501 NOT_SUPPORTED and sends no request', async () => {
    const err = await refusal(() => adapter.getShipment(creds, '6060924986940'))
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/iMile cannot read a shipment/)
    expect(create).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('getOrder throws 501 NOT_SUPPORTED and sends no request', async () => {
    const err = await refusal(() => adapter.getOrder(creds, 'test20201023006'))
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/iMile cannot read an order/)
    expect(create).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})

describe('iMile listCarriers stays a static self-descriptor', () => {
  it('returns the single iMile carrier without a request', async () => {
    const rows = await new IMileAdapter().listCarriers(creds, { page: 1, limit: 50 })
    expect(rows.map((c) => c.id)).toEqual(['imile'])
    expect(create).not.toHaveBeenCalled()
  })
})
