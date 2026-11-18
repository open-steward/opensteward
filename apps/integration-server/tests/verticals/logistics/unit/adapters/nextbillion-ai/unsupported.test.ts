/**
 * NextBillion.ai documents no way to list or read back dispatched routes, so
 * listShipments and getShipment refuse with 501 before sending anything.
 *
 * First-party docs, https://docs.nextbillion.ai/dispatches/route-dispatch-api
 * ("Let's take a look at the various methods available within Route Dispatch
 * API below.") show exactly two methods:
 *
 *   POST https://api.nextbillion.io/fleetify/routes?key={your_api_key}
 *   POST https://api.nextbillion.io/fleetify/v2/routes/{route_id}/redispatch?key={your_api_key}
 *
 * The spec that site renders, https://docs.nextbillion.io/openapi.json, has
 * `/dispatch/routes` with `post` only ("Dispatch a new route") and no GET on a
 * route. The adapter used to call GET /fleetify/routes and
 * GET /fleetify/routes/{id}, neither of which exists.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { NextBillionAiAdapter } from '../../../../../../src/verticals/logistics/adapters/nextbillion-ai/index'

const CREDS = { accessToken: 'nb_test_key' }

function spyHttp() {
  const get = vi.fn(async () => ({ data: {} }))
  const post = vi.fn(async () => ({ data: {} }))
  const del = vi.fn(async () => ({ data: {} }))
  const create = vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post,
    delete: del,
    interceptors: { request: { use: vi.fn() } },
  } as never)
  return { get, post, del, create }
}

afterEach(() => vi.restoreAllMocks())

const NOT_SUPPORTED = expect.objectContaining({ statusCode: 501, code: 'NOT_SUPPORTED' })

describe('nextbillion-ai route reads refuse without a request', () => {
  const cases: Array<[string, (a: NextBillionAiAdapter) => Promise<unknown>, RegExp]> = [
    [
      'listShipments',
      (a) => a.listShipments(CREDS, withPageSink({ page: 1, limit: 10 })),
      /NextBillion\.ai cannot list shipments/,
    ],
    [
      'listShipments page 2 with updatedAfter',
      (a) =>
        a.listShipments(
          CREDS,
          withPageSink({ page: 2, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
        ),
      /NextBillion\.ai cannot list shipments/,
    ],
    [
      'getShipment',
      (a) => a.getShipment(CREDS, 'tqmn-597596'),
      /NextBillion\.ai cannot read shipments/,
    ],
  ]

  for (const [name, call, message] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends nothing`, async () => {
      const http = spyHttp()
      const adapter = new NextBillionAiAdapter()
      const err = await call(adapter).catch((e: unknown) => e)
      expect(err).toEqual(NOT_SUPPORTED)
      expect((err as Error).message).toMatch(message)
      expect(http.get).not.toHaveBeenCalled()
      expect(http.post).not.toHaveBeenCalled()
      expect(http.del).not.toHaveBeenCalled()
    })
  }
})
