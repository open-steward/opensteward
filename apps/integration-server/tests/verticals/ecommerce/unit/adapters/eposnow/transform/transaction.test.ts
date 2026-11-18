import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawEposNowTender,
} from '../../../../../../../src/verticals/ecommerce/adapters/eposnow/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTender(overrides: Partial<RawEposNowTender> = {}): RawEposNowTender {
  return {
    Id: 70001,
    TransactionId: 80001,
    Amount: 15.5,
    TenderTypeId: 1,
    TenderTypeName: 'Card',
    Voided: false,
    DateTime: '2024-06-15T14:30:00Z',
    CreatedDate: '2024-06-15T14:30:00Z',
    ...overrides,
  }
}

describe('transformTransaction (Epos Now)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makeTender())
    expect(result.id).toBe('70001')
    expect(result.orderId).toBe('80001')
    expect(result.amount).toEqual({ amount: 1550, currency: 'GBP' })
  })

  it('maps status SUCCESS for non-voided', () => {
    const result = transformTransaction(makeTender())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status FAILURE for voided', () => {
    const result = transformTransaction(makeTender({ Voided: true }))
    expect(result.status).toBe('FAILURE')
  })

  it('maps kind to SALE', () => {
    const result = transformTransaction(makeTender())
    expect(result.kind).toBe('SALE')
  })

  it('maps gateway from tender type name', () => {
    const result = transformTransaction(makeTender())
    expect(result.gateway).toBe('eposnow_card')
  })

  it('maps gateway for cash tender', () => {
    const result = transformTransaction(makeTender({ TenderTypeName: 'Cash' }))
    expect(result.gateway).toBe('eposnow_cash')
  })

  it('defaults gateway when no tender type name', () => {
    const result = transformTransaction(makeTender({ TenderTypeName: undefined }))
    expect(result.gateway).toBe('eposnow')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeTender()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeTender())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('handles missing amount', () => {
    const result = transformTransaction(makeTender({ Amount: undefined }))
    expect(result.amount).toBeUndefined()
  })
})
