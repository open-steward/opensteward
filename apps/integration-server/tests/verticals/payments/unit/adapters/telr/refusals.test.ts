/**
 * Telr list methods refuse with 501 before sending anything.
 *
 * The adapter used to GET REST-style sub-paths of
 * https://secure.telr.com/gateway/order.json (`/customers`, `/charges`,
 * `/refunds`). Telr documents that URL as a single POST RPC endpoint: the
 * Create session spec (https://docs.telr.com/reference/payment-page) declares
 * server `https://secure.telr.com/gateway` and only `"/order.json": { "post"`.
 *
 * - Customers: Telr has no customer resource. Customer details are sent
 *   inline with an order — "You can send these details by including the
 *   following fields with the transaction request:"
 *   (https://docs.telr.com/reference/customer-details). Nothing lists or reads
 *   them back, so getCustomer refuses too.
 * - Charges and refunds: the only documented transaction listing is the
 *   Service API "Recent transaction list" (GET /tools/api/xml/transaction),
 *   which takes no parameters and is capped: "This will provide a list of the
 *   most recent transactions processed within the last 48 hours. A maximum of
 *   30 transactions will be included." (https://docs.telr.com/reference/services).
 *   A capped window is not a list: serving it would tell the sync the
 *   collection is complete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { TelrAdapter } from '../../../../../../src/verticals/payments/adapters/telr'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { getMock, postMock, ctorMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  ctorMock: vi.fn(),
}))

vi.mock('../../../../../../src/verticals/payments/adapters/telr/client', () => ({
  TelrClient: class {
    constructor() {
      ctorMock()
    }
    get = getMock
    post = postMock
    delete = vi.fn()
  },
}))

const adapter: PaymentsAdapter = new TelrAdapter()
const CREDS: Credentials = { accessToken: 'telr_auth_key' }

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  ctorMock.mockReset()
})

async function expectRefusal(call: () => Promise<unknown>, pattern: RegExp) {
  const err = (await call().then(
    () => {
      throw new Error('expected a refusal')
    },
    (e: unknown) => e,
  )) as Error & { statusCode?: number; code?: string }
  expect(err.statusCode).toBe(501)
  expect(err.code).toBe('NOT_SUPPORTED')
  expect(err.message).toMatch(pattern)
  expect(ctorMock).not.toHaveBeenCalled()
  expect(getMock).not.toHaveBeenCalled()
  expect(postMock).not.toHaveBeenCalled()
}

describe('telr list refusals', () => {
  it('listCustomers throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(
      () => adapter.listCustomers!(CREDS, { page: 1, limit: 10 }),
      /Telr cannot list customers/,
    )
  })

  it('getCustomer throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(() => adapter.getCustomer!(CREDS, 'cust_1'), /Telr cannot read customers/)
  })

  it('listCharges throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(
      () => adapter.listCharges!(CREDS, { page: 2, limit: 25 }),
      /Telr cannot list charges: .*48 hours.*maximum of 30/,
    )
  })

  // Paired get of a refused list. The only documented transaction lookup is
  // "https://secure.telr.com/tools/api/xml/transaction/{tranref}" with HTTP
  // Basic merchant_id:api_key ("Service API uses the HTTP Basic Access
  // Authentication method.", https://docs.telr.com/reference/authentication),
  // and the adapter collects no merchant ID.
  it('getCharge throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(
      () => adapter.getCharge!(CREDS, 'tran_1'),
      /Telr cannot read charges: .*HTTP Basic.*merchant ID/,
    )
  })

  it('listRefunds throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expectRefusal(
      () => adapter.listRefunds!(CREDS, { page: 1, limit: 50 }),
      /Telr cannot list refunds: .*maximum of 30/,
    )
  })
})
