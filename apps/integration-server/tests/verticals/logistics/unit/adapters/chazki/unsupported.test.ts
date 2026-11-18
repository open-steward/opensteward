/**
 * Chazki documents no collection endpoint for shipments, orders or tracking
 * events.
 *
 * First-party spec (Peru Legacy, the API this adapter's base URL serves):
 * https://raw.githubusercontent.com/Chazki-Archive/chazki-api-bucket/HEAD/src/components/constans/yaml/peru-legacy.yaml
 *
 * Its ten paths are /create/delivery-service, /cancel/order, /status/record,
 * /status/record/all, /tracking/select/delivery-code, /tracking/images,
 * /tracking/label, /tracking/label/all, /coverage/position and
 * /coverage/distance. None lists a collection, and no path takes a page,
 * limit, offset, cursor or date parameter. The two paths the list methods used
 * to call are per-delivery lookups:
 *
 *   /status/record      "This API allows us to see the states through which the
 *                        delivery passed grouped by services."
 *   /status/record/all  "statusList: ... Array with all states of the order
 *                        (internal states of chazki)"
 *
 * and both take `code`, whose queryCode parameter reads "description: Delivery
 * track code." and, on its own line, "required: true". So every list method
 * refuses before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { ChazkiAdapter } from '../../../../../../src/verticals/logistics/adapters/chazki/index'

const CREDS = { accessToken: '00000000-0000-0000-0000-000000000000' }

function spyHttp() {
  const get = vi.fn(async () => ({ data: {} }))
  const post = vi.fn(async () => ({ data: {} }))
  const put = vi.fn(async () => ({ data: {} }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post, put } as never)
  return { get, post, put, create }
}

afterEach(() => vi.restoreAllMocks())

const NOT_SUPPORTED = expect.objectContaining({ statusCode: 501, code: 'NOT_SUPPORTED' })

type ListMethod = 'listShipments' | 'listOrders' | 'listTrackingEvents'

const METHODS: Array<[ListMethod, RegExp]> = [
  ['listShipments', /Chazki cannot list shipments/],
  ['listOrders', /Chazki cannot list orders/],
  ['listTrackingEvents', /Chazki cannot list tracking events/],
]

const PARAMS: Array<[string, Parameters<ChazkiAdapter['listShipments']>[1]]> = [
  ['page 1', withPageSink({ page: 1, limit: 10 })],
  [
    'page 2 with updatedAfter',
    withPageSink({ page: 2, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
  ],
]

for (const [method, label] of METHODS) {
  describe(`chazki ${method} refuses without a request`, () => {
    for (const [name, params] of PARAMS) {
      it(`${name}: throws 501 NOT_SUPPORTED and sends no request`, async () => {
        const { get, post, put, create } = spyHttp()
        const err = await new ChazkiAdapter()[method](CREDS, params).catch((e: unknown) => e)
        expect(err).toBeInstanceOf(Error)
        expect(err).toEqual(NOT_SUPPORTED)
        expect((err as Error).message).toMatch(label)
        expect((err as Error).message).toContain(
          '`code` (queryCode: "description: Delivery track code." / "required: true")',
        )
        expect(get).not.toHaveBeenCalled()
        expect(post).not.toHaveBeenCalled()
        expect(put).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
      })
    }
  })
}
