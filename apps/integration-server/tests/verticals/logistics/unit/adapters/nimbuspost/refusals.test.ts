/**
 * NimbusPost orders and warehouses are refused with 501 before any request.
 *
 * The adapter's client targets the Partners API (https://api.nimbuspost.com/v1,
 * https://documenter.getpostman.com/view/9692837/TW6wHnoz), whose collection
 * has only users/login, shipments*, courier* and ndr*: no orders and no
 * warehouse route. A live probe of api.nimbuspost.com/v1/orders and /v1/warehouse
 * returns the API Gateway "no such route" error, the same as a made-up path.
 *
 * Orders and warehouses are documented only on the separate Ship API
 * (https://documenter.getpostman.com/view/9692837/SWE6beC7): GET
 * https://ship.nimbuspost.com/api/orders, GET .../orders/{id} and GET
 * .../warehouse, with the NP-API-KEY header. Those three entries carry no
 * example response and no response field table ("This API will list orders
 * from your Nimbuspost account." / "This API will list all warehouses from
 * your Nimbuspost account. No other body parameters are required."), so there
 * is no documented source for an order or warehouse id or any other field.
 * Mapping rows would mean guessing field names, so the methods refuse.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { NimbusPostAdapter } from '../../../../../../src/verticals/logistics/adapters/nimbuspost/index'

const CREDS = { accessToken: 'nimbuspost_test' }

function spyHttp() {
  const get = vi.fn()
  const post = vi.fn()
  const create = vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post,
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  const request = vi.spyOn(axios, 'request')
  const directGet = vi.spyOn(axios, 'get')
  return { create, get, post, request, directGet }
}

function expectNothingSent(h: ReturnType<typeof spyHttp>) {
  expect(h.create).not.toHaveBeenCalled()
  expect(h.get).not.toHaveBeenCalled()
  expect(h.post).not.toHaveBeenCalled()
  expect(h.request).not.toHaveBeenCalled()
  expect(h.directGet).not.toHaveBeenCalled()
}

afterEach(() => vi.restoreAllMocks())

describe('nimbuspost refuses orders and warehouses (response undocumented)', () => {
  it('listOrders throws 501 NOT_SUPPORTED and sends no request', async () => {
    const h = spyHttp()
    await expect(
      new NimbusPostAdapter().listOrders(CREDS, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(
        /^NimbusPost cannot list orders: .*ship\.nimbuspost\.com\/api\/orders/,
      ),
    })
    expectNothingSent(h)
  })

  it('getOrder throws 501 NOT_SUPPORTED and sends no request', async () => {
    const h = spyHttp()
    await expect(new NimbusPostAdapter().getOrder(CREDS, '4433')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^NimbusPost cannot read orders: .*orders\/\{id\}/),
    })
    expectNothingSent(h)
  })

  it('listWarehouses throws 501 NOT_SUPPORTED and sends no request', async () => {
    const h = spyHttp()
    await expect(
      new NimbusPostAdapter().listWarehouses(CREDS, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(
        /^NimbusPost cannot list warehouses: .*ship\.nimbuspost\.com\/api\/warehouse/,
      ),
    })
    expectNothingSent(h)
  })
})
