/**
 * Fixture: the "Get payout response" example on
 * https://developers.muralpay.com/docs/get-payout-request-status.md,
 * a PayoutRequest whose one payout is a fiat COP payout in status "pending".
 */
import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawMuralPayout,
  type RawMuralPayoutRequest,
} from '../../../../../../../src/verticals/payments/adapters/mural-pay/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

function docExample(): RawMuralPayoutRequest {
  return {
    id: 'd1cd7a75-fcf9-4624-b2fe-080e920e2e8f',
    createdAt: '2025-04-05T04:24:03.862Z',
    updatedAt: '2025-04-05T04:24:03.862Z',
    transactionHash: '0x786e4eefde9260c82eed6861be085f724b21ab67d9ffca39a34ed2b80b100ff7',
    sourceAccountId: '5d75e362-0812-4ea8-b203-c7c3a09f8473',
    memo: 'test',
    status: 'EXECUTED',
    payouts: [
      {
        id: '34998641-c981-44bc-beda-14b930999284',
        createdAt: '2025-04-05T04:24:03.869Z',
        updatedAt: '2025-04-05T04:26:24.198Z',
        amount: { tokenSymbol: 'USDC', tokenAmount: 100 },
        details: {
          type: 'fiat',
          fiatAndRailCode: 'cop',
          fiatAmount: { fiatAmount: 305421.23, fiatCurrencyCode: 'COP' },
          transactionFee: { tokenSymbol: 'USDC', tokenAmount: 0.35 },
          exchangeFeePercentage: 1.4,
          exchangeRate: 3108.613065,
          feeTotal: { tokenSymbol: 'USDC', tokenAmount: 1.75 },
          fiatPayoutStatus: { type: 'pending', initiatedAt: '2025-04-05T04:27:01.901Z' },
        },
      },
    ],
  }
}

function withStatus(status: Record<string, unknown>): [RawMuralPayoutRequest, RawMuralPayout] {
  const req = docExample()
  const p = req.payouts[0]!
  ;(p.details as { fiatPayoutStatus: unknown }).fiatPayoutStatus = status
  return [req, p]
}

describe('mural-pay transformPayout', () => {
  it('maps the documented example payout, parsing with PayoutSchema', () => {
    const req = docExample()
    const out = PayoutSchema.parse(transformPayout(req, req.payouts[0]!))
    expect(out.id).toBe('d1cd7a75-fcf9-4624-b2fe-080e920e2e8f:34998641-c981-44bc-beda-14b930999284')
    expect(out.externalId).toBe('34998641-c981-44bc-beda-14b930999284')
    // fiatAmount 305421.23 COP, in major units → minor units (COP has 2 decimals).
    expect(out.amount).toBe(30542123)
    expect(out.currency).toBe('COP')
    expect(out.status).toBe('in_transit')
    expect(out.createdAt).toBe('2025-04-05T04:24:03.869Z')
    expect(out.updatedAt).toBe('2025-04-05T04:26:24.198Z')
    expect(out.gateway).toBe('mural-pay')
    expect(out.arrivalDate).toBeUndefined()
  })

  it.each([
    [{ type: 'created' }, 'pending'],
    [{ type: 'on-hold', initiatedAt: '2025-04-05T04:27:01.901Z' }, 'in_transit'],
    [{ type: 'canceled' }, 'cancelled'],
    [{ type: 'somethingNew' }, 'unknown'],
  ])('maps fiatPayoutStatus %j to %s', (status, expected) => {
    const [req, p] = withStatus(status)
    expect(PayoutSchema.parse(transformPayout(req, p)).status).toBe(expected)
  })

  it('maps a completed payout to paid with completedAt as the arrival date', () => {
    const [req, p] = withStatus({
      type: 'completed',
      initiatedAt: '2025-04-05T04:27:01.901Z',
      completedAt: '2025-04-06T10:00:00.000Z',
    })
    const out = PayoutSchema.parse(transformPayout(req, p))
    expect(out.status).toBe('paid')
    expect(out.arrivalDate).toBe('2025-04-06T10:00:00.000Z')
  })

  it('maps a refunded payout to failed with its errorCode and failureReason', () => {
    const [req, p] = withStatus({
      type: 'refunded',
      refundTransactionId: 'tx-1',
      failureReason: 'Account closed',
      errorCode: 'ACCOUNT_CLOSED',
      initiatedAt: '2025-04-05T04:27:01.901Z',
      refundInitiatedAt: '2025-04-06T04:27:01.901Z',
      refundCompletedAt: '2025-04-07T04:27:01.901Z',
    })
    const out = PayoutSchema.parse(transformPayout(req, p))
    expect(out.status).toBe('failed')
    expect(out.failureCode).toBe('ACCOUNT_CLOSED')
    expect(out.failureMessage).toBe('Account closed')
  })

  it('maps a refundInProgress payout to failed with its errorCode and failureReason', () => {
    // PayoutRefundInProgressStatus requires type, failureReason, errorCode,
    // initiatedAt and refundInitiatedAt (searchpayoutrequests.md).
    const [req, p] = withStatus({
      type: 'refundInProgress',
      failureReason: 'Account closed',
      errorCode: 'ACCOUNT_CLOSED',
      initiatedAt: '2025-04-05T04:27:01.901Z',
      refundInitiatedAt: '2025-04-06T04:27:01.901Z',
    })
    const out = PayoutSchema.parse(transformPayout(req, p))
    expect(out.status).toBe('failed')
    expect(out.failureCode).toBe('ACCOUNT_CLOSED')
    expect(out.failureMessage).toBe('Account closed')
  })

  it('maps a deprecated failed payout to failed with its reason', () => {
    const [req, p] = withStatus({
      type: 'failed',
      reason: 'Rejected',
      errorCode: 'REJECTED_BY_BANK',
      initiatedAt: '2025-04-05T04:27:01.901Z',
    })
    const out = PayoutSchema.parse(transformPayout(req, p))
    expect(out.failureCode).toBe('REJECTED_BY_BANK')
    expect(out.failureMessage).toBe('Rejected')
  })

  it('converts by the payout currency exponent (EUR 12.5 → 1250)', () => {
    const req = docExample()
    const p = req.payouts[0]!
    ;(p.details as { fiatAmount: unknown }).fiatAmount = {
      fiatAmount: 12.5,
      fiatCurrencyCode: 'EUR',
    }
    const out = PayoutSchema.parse(transformPayout(req, p))
    expect(out.amount).toBe(1250)
    expect(out.currency).toBe('EUR')
  })

  it('throws on a blockchain payout rather than inventing a currency', () => {
    const req = docExample()
    const p: RawMuralPayout = {
      ...req.payouts[0]!,
      details: {
        type: 'blockchain',
        walletAddress: '0xabc',
        blockchain: 'POLYGON',
        token: 'USDC',
        status: 'EXECUTED',
        destinationAmount: { tokenSymbol: 'USDC', tokenAmount: 100 },
      },
    }
    expect(() => transformPayout(req, p)).toThrow(/token, not an ISO 4217 currency/)
  })
})
