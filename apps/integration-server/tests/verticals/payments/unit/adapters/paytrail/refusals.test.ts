import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { PaytrailAdapter } from '../../../../../../src/verticals/payments/adapters/paytrail/index'

/**
 * Paytrail documents no list endpoint that can serve customers, charges,
 * refunds or payouts (https://docs.paytrail.com/paytrail-api.yaml,
 * https://docs.paytrail.com/README.md). Each of these reads must refuse with
 * 501 NOT_SUPPORTED before any HTTP client is built or any request is sent.
 */

const creds: Credentials = { accessToken: 'k', refreshToken: 's' }

function trapHttp() {
  const request = vi.fn(() => Promise.reject(new Error('no request may be sent')))
  const create = vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: request,
        post: request,
        delete: request,
        request,
      }) as unknown as ReturnType<typeof axios.create>,
  )
  return { create, request }
}

async function expectRefusal(p: Promise<unknown>, pattern: RegExp) {
  const err = await p.then(
    () => {
      throw new Error('expected a 501 refusal')
    },
    (e: unknown) => e as Error & { statusCode?: number; code?: string },
  )
  expect(err.statusCode).toBe(501)
  expect(err.code).toBe('NOT_SUPPORTED')
  expect(err.message).toMatch(pattern)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('paytrail read refusals', () => {
  const adapter = new PaytrailAdapter()

  it('listCustomers refuses 501 and sends no request', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(
      adapter.listCustomers(creds, { page: 1, limit: 10 }),
      /Paytrail cannot list customers/,
    )
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('getCustomer refuses 501 and sends no request', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(adapter.getCustomer(creds, 'c1'), /Paytrail cannot read customers/)
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('listCharges refuses 501 and sends no request', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(
      adapter.listCharges(creds, { page: 1, limit: 10 }),
      /Paytrail cannot list charges/,
    )
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('getCharge refuses 501 and sends no request', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(adapter.getCharge(creds, 'txn-1'), /Paytrail getCharge is not supported/)
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('listRefunds refuses 501 and sends no request', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(
      adapter.listRefunds(creds, { page: 1, limit: 10 }),
      /Paytrail cannot list refunds/,
    )
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('listPayouts refuses 501 and sends no request, even with updatedAfter', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(
      adapter.listPayouts(creds, { page: 1, limit: 10 }),
      /Paytrail cannot list payouts: .*id, createdAt, settledAt and settlementReference, with no settled amount or currency/,
    )
    await expectRefusal(
      adapter.listPayouts(creds, {
        page: 2,
        limit: 5,
        updatedAfter: new Date('2026-01-01T00:00:00Z'),
      }),
      /Paytrail cannot list payouts/,
    )
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('getPayout refuses 501 and sends no request', async () => {
    const { create, request } = trapHttp()
    await expectRefusal(adapter.getPayout(creds, '678'), /Paytrail cannot read payouts/)
    expect(create).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })
})
