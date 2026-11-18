/**
 * listCustomers refuses: Mercado Libre documents no way to list customers.
 *
 * https://developers.mercadolibre.com.ar/en_us/customer-data-access documents
 * GET /shops/cda/customers, but every result is an ORDER ("Answer with the
 * orders registered by the buyer and his information."; paging.total is
 * "Total orders resulting from the search."), so one buyer comes back once per
 * order: the page's own example returns buyer 780777832 on orders 4697463433
 * and 4697450495. The unfiltered query also needs a date range ("The date range
 * must be sent."), and the page documents no retention limit to bound it.
 *
 * So the method must throw 501 NOT_SUPPORTED before sending anything.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { MercadoLibreAdapter } from '../../../../../../src/verticals/ecommerce/adapters/mercadolibre/index'

const CREDS: Credentials = { accessToken: 'tok', extra: { userId: '12345' } }

function spyHttp() {
  const get = vi.fn(async (_path: string, _config?: unknown): Promise<{ data: unknown }> => ({
    data: { results: [], paging: { total: 0, limit: 15 } },
  }))
  const post = vi.fn(async () => ({ data: {} }))
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, put: post, delete: post } as never)
  return { get, post }
}

afterEach(() => vi.restoreAllMocks())

describe('Mercado Libre listCustomers', () => {
  const cases: QueryParams[] = [
    { page: 1, limit: 50 },
    { page: 2, limit: 10 },
    { page: 1, limit: 50, updatedAfter: new Date('2026-01-01T00:00:00Z') },
    { page: 1, limit: 50, buyer_id: '780777832' },
  ]
  for (const params of cases) {
    it(`throws 501 NOT_SUPPORTED and sends no request (${JSON.stringify(params)})`, async () => {
      const { get, post } = spyHttp()
      const adapter = new MercadoLibreAdapter()
      await expect(adapter.listCustomers(CREDS, params)).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringContaining('Mercado Libre cannot list customers'),
      })
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
    })
  }

  it('getCustomer still reads the documented buyer_id query', async () => {
    const { get } = spyHttp()
    get.mockResolvedValueOnce({
      data: {
        results: [
          {
            id: 2000005004071824,
            date_created: '2023-01-26T21:27:24.000+00:00',
            buyer: {
              id: 1080426219,
              person: {
                birthdate: '1987-05-26',
                first_name: 'Faulkner',
                gender: 'M',
                last_name: 'Hoover',
              },
              contact: { phone: '542661180352832', email: 'faulkner.hoover@example.net' },
              ms_seller_promotions: false,
            },
            paid_amount: 1150.0,
            currency_id: 'ARS',
          },
        ],
      },
    })
    const adapter = new MercadoLibreAdapter()
    const c = await adapter.getCustomer(CREDS, '1080426219')
    expect(get).toHaveBeenCalledWith('/shops/cda/customers', {
      params: { buyer_id: '1080426219' },
    })
    expect(c.id).toBe('1080426219')
    expect(c.email).toBe('faulkner.hoover@example.net')
  })
})
