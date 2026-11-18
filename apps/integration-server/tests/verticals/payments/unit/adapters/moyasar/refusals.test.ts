/**
 * Moyasar has no customer or refund resource, so listCustomers, getCustomer
 * and listRefunds refuse with 501 NOT_SUPPORTED before any request is sent;
 * getCharge reads GET /payments/:id
 * (https://docs.moyasar.com/api/payments/02-fetch-payment).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import type { QueryParams } from '@opensteward/shared'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { MoyasarAdapter } from '../../../../../../src/verticals/payments/adapters/moyasar/index'

const CREDS = { accessToken: Buffer.from('sk_test_abc:').toString('base64') }

function fakeHttp(body: unknown = {}): {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
} {
  const get = vi.fn(async () => ({ data: body }))
  const post = vi.fn(async () => ({ data: body }))
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, defaults: {} } as never)
  return { get, post }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Moyasar refusals', () => {
  it.each([
    ['listCustomers', /cannot list customers/],
    ['getCustomer', /cannot fetch customers/],
    ['listRefunds', /cannot list refunds/],
  ] as const)('%s throws 501 NOT_SUPPORTED and sends no request', async (method, msg) => {
    const { get, post } = fakeHttp()
    const adapter = new MoyasarAdapter() as unknown as Record<
      string,
      (c: unknown, p: unknown) => Promise<unknown>
    >
    const arg = method === 'getCustomer' ? 'cus_1' : ({ page: 1, limit: 10 } as QueryParams)
    await expect(adapter[method]!(CREDS, arg)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(msg),
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})

describe('Moyasar getCharge', () => {
  it('reads GET /payments/:id and parses the documented payment body', async () => {
    const { get } = fakeHttp({
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      status: 'paid',
      amount: 100,
      currency: 'SAR',
      refunded: 0,
      captured: 0,
      created_at: '2026-01-15T09:30:00Z',
      updated_at: '2026-01-15T09:30:00Z',
      metadata: {},
      source: {},
    })
    const charge = await new MoyasarAdapter().getCharge(
      CREDS,
      '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    )
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('/payments/3fa85f64-5717-4562-b3fc-2c963f66afa6')
    expect(ChargeSchema.parse(charge)).toMatchObject({
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      amount: 100,
      currency: 'SAR',
      status: 'succeeded',
    })
  })

  it('URI-encodes the id into the /payments/:id path', async () => {
    const { get } = fakeHttp({
      id: 'a/b?c',
      status: 'paid',
      amount: 100,
      currency: 'SAR',
      refunded: 0,
      captured: 0,
      created_at: '2026-01-15T09:30:00Z',
      updated_at: '2026-01-15T09:30:00Z',
    })
    await new MoyasarAdapter().getCharge(CREDS, 'a/b?c')
    expect(get.mock.calls[0]![0]).toBe('/payments/a%2Fb%3Fc')
  })

  it('lists charges from GET /payments with only the documented `page` query', async () => {
    const { get } = fakeHttp({
      payments: [{ id: 'p1', status: 'paid', amount: 100, currency: 'SAR' }],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1 },
    })
    const rows = await new MoyasarAdapter().listCharges(CREDS, {
      page: 1,
      limit: 10,
    } as QueryParams)
    expect(rows.map((r) => r.id)).toEqual(['p1'])
    expect(get.mock.calls[0]![0]).toBe('/payments')
    expect(get.mock.calls[0]![1]).toEqual({ params: { page: 1 } })
  })
})
