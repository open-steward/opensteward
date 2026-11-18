/**
 * Splitit read methods refuse with 501 NOT_SUPPORTED before any request.
 *
 * Splitit's documented APIs (Installments v3/v4, Merchant Reports, Chargebacks,
 * Keys, AMS, Text-to-Pay; sitemap https://developers.splitit.com/sitemap.xml)
 * have no customer, charge, refund or payout resource:
 *  - https://developers.splitit.com/api/v3/introduction/ — "Splitit's
 *    Installments API is the primary Splitit tool for establishing and
 *    maintaining installment plans."
 *  - https://developers.splitit.com/api/v3/refund/ — refunds exist only as
 *    "POST /:installmentPlanNumber/refund Refund part or all of an installment plan."
 * The adapter used to call GET /customers, /charges, /refunds, /payouts (and
 * /{resource}/{id}) on an undocumented host.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { requestSpy } = vi.hoisted(() => ({ requestSpy: vi.fn() }))

vi.mock('axios', () => {
  const instance = {
    get: requestSpy,
    post: requestSpy,
    patch: requestSpy,
    delete: requestSpy,
    request: requestSpy,
  }
  return {
    default: { ...instance, create: vi.fn(() => instance) },
  }
})

import { SplititAdapter } from '../../../../../../src/verticals/payments/adapters/splitit'

const credentials = { accessToken: 'tok' }
const adapter = new SplititAdapter({
  clientId: 'cid',
  clientSecret: 'cs',
  redirectUri: 'https://x/cb',
})

beforeEach(() => {
  requestSpy.mockReset()
  requestSpy.mockResolvedValue({ data: { data: [{ id: 'x' }] } })
})

describe('splitit read methods', () => {
  it.each([
    ['listCustomers', () => adapter.listCustomers(credentials, { page: 1, limit: 10 })],
    ['getCustomer', () => adapter.getCustomer(credentials, 'c1')],
    ['listCharges', () => adapter.listCharges(credentials, { page: 1, limit: 10 })],
    ['getCharge', () => adapter.getCharge(credentials, 'ch1')],
    ['listRefunds', () => adapter.listRefunds(credentials, { page: 1, limit: 10 })],
    ['getRefund', () => adapter.getRefund(credentials, 'r1')],
    ['listPayouts', () => adapter.listPayouts(credentials, { page: 1, limit: 10 })],
    ['getPayout', () => adapter.getPayout(credentials, 'p1')],
  ] as const)('%s refuses with 501 NOT_SUPPORTED and sends no request', async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(requestSpy).not.toHaveBeenCalled()
  })

  it.each([
    [
      'listCustomers',
      /^Splitit cannot list customers: .*none documents this resource$/,
      () => adapter.listCustomers(credentials, { page: 1, limit: 10 }),
    ],
    [
      'getCustomer',
      /^Splitit cannot get a customer: .*none documents this resource$/,
      () => adapter.getCustomer(credentials, 'c1'),
    ],
    [
      'listCharges',
      /^Splitit cannot list charges: .*GET \/search Retrieves a plan by RefOrderNumber or ExtendedParams.*no page or size parameter$/,
      () => adapter.listCharges(credentials, { page: 1, limit: 10 }),
    ],
    [
      'getCharge',
      /^Splitit cannot get a charge: Splitit documents no charge resource; .*does not map to charges$/,
      () => adapter.getCharge(credentials, 'ch1'),
    ],
    [
      'listRefunds',
      /^Splitit cannot list refunds: .*POST \/:installmentPlanNumber\/refund/,
      () => adapter.listRefunds(credentials, { page: 1, limit: 10 }),
    ],
    [
      'getRefund',
      /^Splitit cannot get a refund: .*POST \/:installmentPlanNumber\/refund/,
      () => adapter.getRefund(credentials, 'r1'),
    ],
    [
      'listPayouts',
      /^Splitit cannot list payouts: .*none documents this resource$/,
      () => adapter.listPayouts(credentials, { page: 1, limit: 10 }),
    ],
    [
      'getPayout',
      /^Splitit cannot get a payout: .*none documents this resource$/,
      () => adapter.getPayout(credentials, 'p1'),
    ],
  ] as const)(
    '%s names the vendor, the resource and the documented reason',
    async (_name, message, run) => {
      await expect(run()).rejects.toThrow(message)
    },
  )
})
