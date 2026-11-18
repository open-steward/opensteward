import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawDokuOrder,
} from '../../../../../../../src/verticals/payments/adapters/doku/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('doku transformCharge', () => {
  it('maps a SUCCESS transaction to "succeeded" and extracts fields', () => {
    const raw: RawDokuOrder = {
      order: {
        invoice_number: 'INV-001',
        amount: 100000,
        currency: 'IDR',
        session_id: 'sess_abc',
      },
      transaction: {
        status: 'SUCCESS',
        date: '2024-03-01T00:00:00Z',
        original_request_id: 'req_001',
        message: undefined,
      },
      payment: {
        url: 'https://checkout.doku.com/pay/INV-001',
        token_id: 'tok_abc',
      },
      acquirer: { id: 'acq_001' },
      channel: { id: 'chan_001' },
      customer: { id: 'cus_001', name: 'Budi', email: 'budi@example.com', phone: '+62811111111' },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('INV-001')
    expect(result.externalId).toBe('INV-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(100000)
    expect(result.currency).toBe('IDR')
    expect(result.customerId).toBe('cus_001')
    expect(result.receiptEmail).toBe('budi@example.com')
    expect(result.receiptUrl).toBe('https://checkout.doku.com/pay/INV-001')
    expect(result.gateway).toBe('doku')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING status to "pending"', () => {
    const raw: RawDokuOrder = {
      order: { invoice_number: 'INV-002', amount: 50000, currency: 'IDR' },
      transaction: { status: 'PENDING', date: '2024-03-01T00:00:00Z' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps FAILED status to "failed"', () => {
    const raw: RawDokuOrder = {
      order: { invoice_number: 'INV-003', amount: 75000, currency: 'IDR' },
      transaction: {
        status: 'FAILED',
        date: '2024-03-01T00:00:00Z',
        message: 'Insufficient balance',
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Insufficient balance')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps VOID/CANCELLED status to "cancelled"', () => {
    const raw: RawDokuOrder = {
      order: { invoice_number: 'INV-004', amount: 25000, currency: 'IDR' },
      transaction: { status: 'VOID', date: '2024-03-01T00:00:00Z' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to session_id when invoice_number is absent', () => {
    const raw: RawDokuOrder = {
      order: { session_id: 'sess_fallback', amount: 10000, currency: 'IDR' },
      transaction: { status: 'ORDER_GENERATED', date: '2024-03-01T00:00:00Z' },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('sess_fallback')
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
