/**
 * PayoneerAdapter read methods against Payoneer's documented v4 surface.
 *
 * Payoneer's first-party OpenAPI exports (Stoplight project cHJqOjEwNzYxNg,
 * embedded by https://developer.payoneer.com/docs/mass-payouts-and-services.html):
 * - https://stoplight.io/api/v1/projects/payoneer/services-api/nodes/reference/Open%20APIs.oas2.yml?fromExportButton=true&snapshotType=http_service
 * - https://stoplight.io/api/v1/projects/payoneer/services-api/nodes/reference/Mass%20Payout%20V4.oas2.yml?fromExportButton=true&snapshotType=http_service
 *
 * Together they publish 35 operations. None is a /customers, /charges,
 * /refunds or /payouts collection, and every payee, payout and payment read is
 * scoped by a program_id or account_id this adapter has no source for. So each
 * list/get method must refuse with 501 NOT_SUPPORTED before sending anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'

const { getMock, postMock, createMock } = vi.hoisted(() => {
  const getMock = vi.fn()
  const postMock = vi.fn()
  const createMock = vi.fn((_cfg?: unknown) => ({ get: getMock, post: postMock }))
  return { getMock, postMock, createMock }
})

vi.mock('axios', () => ({
  default: { create: createMock, post: postMock, get: getMock },
}))

import { PayoneerAdapter } from '../../../../../../src/verticals/payments/adapters/payoneer'

const adapter = new PayoneerAdapter({
  clientId: 'cid',
  clientSecret: 'csecret',
  redirectUri: 'https://example.test/callback',
})
const CREDS: Credentials = { accessToken: 'token' }

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
})

describe.each([
  ['listCustomers', /^Payoneer cannot list customers: .*no \/customers/],
  ['getCustomer', /^Payoneer cannot read customers: .*no \/customers/],
  ['listCharges', /^Payoneer cannot list charges: .*no \/charges/],
  ['getCharge', /^Payoneer cannot read charges: .*account_id/],
  ['listRefunds', /^Payoneer cannot list refunds: .*no refund resource/],
  ['getRefund', /^Payoneer cannot read refunds: .*no refund resource/],
  ['listPayouts', /^Payoneer cannot list payouts: .*no list operation/],
  ['getPayout', /^Payoneer cannot read payouts: .*program_id/],
] as const)('PayoneerAdapter.%s', (method, message) => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const fn = adapter[method].bind(adapter) as (c: Credentials, a: unknown) => Promise<unknown>
    const arg = method.startsWith('list') ? { page: 1, limit: 10 } : 'some-id'
    await expect(fn(CREDS, arg)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(message),
    })
    expect(createMock).not.toHaveBeenCalled()
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe.each(['listCustomers', 'listCharges', 'listRefunds', 'listPayouts'] as const)(
  'PayoneerAdapter.%s with updatedAfter',
  (method) => {
    it('still refuses before sending a request', async () => {
      const fn = adapter[method].bind(adapter) as (c: Credentials, a: unknown) => Promise<unknown>
      await expect(
        fn(CREDS, { page: 2, limit: 5, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(createMock).not.toHaveBeenCalled()
      expect(getMock).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  },
)
