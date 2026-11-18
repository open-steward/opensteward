import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  transformTransactionPayout,
  type RawTrueLayerPayout,
  type RawTrueLayerPayoutTransaction,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'
import { PAYOUT, PAYOUT_TRANSACTION } from '../fixtures/documented'

describe('truelayer transformTransactionPayout', () => {
  it('maps a documented payout row, keyed by payout_id', () => {
    const raw = {
      ...PAYOUT_TRANSACTION,
      id: 'transaction-id',
    } as unknown as RawTrueLayerPayoutTransaction
    const result = PayoutSchema.parse(transformTransactionPayout(raw))
    expect(result.id).toBe('0cd1b0f7-71bc-4d24-b209-95259dadcc20')
    expect(result.externalId).toBe('0cd1b0f7-71bc-4d24-b209-95259dadcc20')
    expect(result.amount).toBe(100)
    expect(result.currency).toBe('GBP')
    expect(result.status).toBe('paid')
    expect(result.createdAt).toBe('2021-12-25T14:00:00.000Z')
    expect(result.metadata).toEqual({ prop1: 'value1', prop2: 'value2' })
    expect(result.arrivalDate).toBeUndefined()
  })

  it('maps the guide example pending payout row to pending', () => {
    const raw = {
      ...PAYOUT_TRANSACTION,
      status: 'pending',
    } as unknown as RawTrueLayerPayoutTransaction
    expect(PayoutSchema.parse(transformTransactionPayout(raw)).status).toBe('pending')
  })
})

describe('truelayer transformPayout', () => {
  it('maps the documented External account payout example', () => {
    const raw = { ...PAYOUT } as unknown as RawTrueLayerPayout
    const result = PayoutSchema.parse(transformPayout(raw))
    expect(result.id).toBe('0cd1b0f7-71bc-4d24-b209-95259dadcc20')
    expect(result.amount).toBe(100)
    expect(result.currency).toBe('GBP')
    expect(result.status).toBe('paid')
    expect(result.createdAt).toBe('2021-12-25T14:00:00.000Z')
    expect(result.gateway).toBe('truelayer')
  })

  it.each([
    ['pending', 'pending'],
    ['authorization_required', 'pending'],
    ['authorizing', 'pending'],
    ['authorized', 'pending'],
    ['executed', 'paid'],
    ['failed', 'failed'],
    ['something_new', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    const raw = { ...PAYOUT, status } as unknown as RawTrueLayerPayout
    expect(PayoutSchema.parse(transformPayout(raw)).status).toBe(expected)
  })

  it('maps failure_reason on a failed payout', () => {
    const raw = {
      ...PAYOUT,
      status: 'failed',
      failed_at: '2021-12-25T15:00:00.000Z',
      failure_reason: 'insufficient_funds',
    } as unknown as RawTrueLayerPayout
    expect(PayoutSchema.parse(transformPayout(raw)).failureCode).toBe('insufficient_funds')
  })
})
