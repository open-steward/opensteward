/**
 * getCharge / captureCharge request pinning.
 *
 * Commerce Hub has no GET and no `/captures` endpoint. Reads go through
 * `POST /payments/v1/transaction-inquiry`, whose 201 response is a
 * top-level *array* of matching transactions — not `{paymentTransactions:[]}`.
 * Captures go through `POST /payments/v1/charges` (the same path as create)
 * with `referenceTransactionDetails` + `transactionDetails.captureFlag: true`
 * — there is no `/payments/v1/captures` path in the spec. This file pins the
 * exact path/body the adapter sends and the array-response parsing, so a
 * regression back to the undocumented `payment-inquiry` / `captures` paths
 * (or back to reading `res.paymentTransactions`) fails loudly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/fiserv/client', () => ({
  FiservClient: class {
    post = postMock
  },
}))

import { FiservAdapter } from '../../../../../../src/verticals/payments/adapters/fiserv'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import type { Credentials } from '../../../../../../src/verticals/payments/adapter/interface'

const credentials: Credentials = { accessToken: 'test-api-key', extra: { apiSecret: 'shh', environment: 'sandbox' } }
const adapter = new FiservAdapter()

function rawTxn(overrides: Record<string, unknown> = {}) {
  return {
    gatewayResponse: {
      transactionType: 'CHARGES',
      transactionState: 'CAPTURED',
      transactionProcessingDetails: {
        transactionId: 'txn_123',
        transactionTimestamp: '2026-01-15T10:00:00Z',
      },
    },
    transactionDetails: { captureFlag: true },
    amount: { total: 12.5, currency: 'USD' },
    paymentReceipt: {
      approvedAmount: { total: 12.5, currency: 'USD' },
      processorResponseDetails: { approvalStatus: 'APPROVED' },
    },
    ...overrides,
  }
}

describe('FiservAdapter.getCharge', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('POSTs /payments/v1/transaction-inquiry with referenceTransactionDetails', async () => {
    postMock.mockResolvedValueOnce([rawTxn()])

    await adapter.getCharge(credentials, 'txn_123')

    expect(postMock).toHaveBeenCalledWith('/payments/v1/transaction-inquiry', {
      referenceTransactionDetails: { referenceTransactionId: 'txn_123' },
    })
  })

  it('parses the top-level array response, not res.paymentTransactions', async () => {
    // A payload shaped like the old (wrong) envelope must NOT be read as one —
    // it has to fall through to "no array" / not-found, not to the stray
    // `paymentTransactions` key.
    postMock.mockResolvedValueOnce([rawTxn()])

    const charge = await adapter.getCharge(credentials, 'txn_123')

    expect(charge.id).toBe('txn_123')
    expect(charge.status).toBe('succeeded')
    expect(() => ChargeSchema.parse(charge)).not.toThrow()
  })

  it('picks the most recent entry when the array has more than one match', async () => {
    postMock.mockResolvedValueOnce([
      rawTxn({
        gatewayResponse: {
          transactionState: 'AUTHORIZED',
          transactionProcessingDetails: { transactionId: 'txn_123', transactionTimestamp: '2026-01-15T09:00:00Z' },
        },
      }),
      rawTxn({
        gatewayResponse: {
          transactionState: 'CAPTURED',
          transactionProcessingDetails: { transactionId: 'txn_123', transactionTimestamp: '2026-01-15T10:00:00Z' },
        },
      }),
    ])

    const charge = await adapter.getCharge(credentials, 'txn_123')

    expect(charge.status).toBe('succeeded')
  })

  it('throws a 404-mapped error when the array comes back empty', async () => {
    postMock.mockResolvedValueOnce([])

    await expect(adapter.getCharge(credentials, 'missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('ignores a stray paymentTransactions envelope instead of reading it as the transaction', async () => {
    // Not an array at all — must fall to the not-found guard rather than
    // silently transforming `{}` (or the envelope object itself) into a charge.
    postMock.mockResolvedValueOnce({ paymentTransactions: [rawTxn()] })

    await expect(adapter.getCharge(credentials, 'txn_123')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('FiservAdapter.captureCharge', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('POSTs /payments/v1/charges with referenceTransactionDetails and captureFlag:true', async () => {
    postMock.mockResolvedValueOnce(rawTxn())

    await adapter.captureCharge(credentials, 'txn_123')

    expect(postMock).toHaveBeenCalledWith('/payments/v1/charges', {
      referenceTransactionDetails: { referenceTransactionId: 'txn_123' },
      transactionDetails: { captureFlag: true },
    })
  })

  it('never calls the undocumented /payments/v1/captures path', async () => {
    postMock.mockResolvedValueOnce(rawTxn())

    await adapter.captureCharge(credentials, 'txn_123')

    const calledPaths = postMock.mock.calls.map((c) => c[0])
    expect(calledPaths).not.toContain('/payments/v1/captures')
  })

  it('includes a converted amount for a partial capture, after re-querying currency', async () => {
    // First call: getCharge (transaction-inquiry) to learn the currency.
    postMock.mockResolvedValueOnce([rawTxn({ amount: { total: 12.5, currency: 'USD' } })])
    // Second call: the capture itself.
    postMock.mockResolvedValueOnce(rawTxn())

    await adapter.captureCharge(credentials, 'txn_123', { amount: 500 })

    expect(postMock).toHaveBeenNthCalledWith(1, '/payments/v1/transaction-inquiry', {
      referenceTransactionDetails: { referenceTransactionId: 'txn_123' },
    })
    expect(postMock).toHaveBeenNthCalledWith(2, '/payments/v1/charges', {
      referenceTransactionDetails: { referenceTransactionId: 'txn_123' },
      transactionDetails: { captureFlag: true },
      amount: { total: 5, currency: 'USD' },
    })
  })

  it('round-trips the captured charge through ChargeSchema', async () => {
    postMock.mockResolvedValueOnce(rawTxn())
    const charge = await adapter.captureCharge(credentials, 'txn_123')
    expect(() => ChargeSchema.parse(charge)).not.toThrow()
  })
})
