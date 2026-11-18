import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawCoinpaymentsInvoice,
} from '../../../../../../../src/verticals/payments/adapters/coinpayments/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('coinpayments transformCharge', () => {
  it('maps a "completed" invoice to status "succeeded"', () => {
    const raw: RawCoinpaymentsInvoice = {
      id: 'inv-001',
      invoiceId: 'INV-001',
      status: 'completed',
      currency: { id: 'USD', symbol: 'USD' },
      amount: {
        total: { currencyId: 'USD', value: '125000', displayValue: '1250.00' },
      },
      buyer: { emailAddress: 'buyer@example.com' },
      createdAt: '2024-03-01T00:00:00Z',
      completedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('inv-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(125000)
    expect(result.currency).toBe('USD')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('coinpayments')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "paid" invoice to status "succeeded"', () => {
    const raw: RawCoinpaymentsInvoice = {
      id: 'inv-002',
      status: 'paid',
      currency: { id: 'BTC', symbol: 'BTC' },
      amount: {
        total: { currencyId: 'BTC', value: '100000', displayValue: '0.00100000' },
      },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('BTC')
    expect(result.amount).toBe(100000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "pending" invoice to status "pending"', () => {
    const raw: RawCoinpaymentsInvoice = {
      id: 'inv-003',
      status: 'pending',
      currency: { id: 'USD', symbol: 'USD' },
      amount: {
        total: { currencyId: 'USD', value: '5000', displayValue: '50.00' },
      },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps "cancelled" invoice to status "cancelled"', () => {
    const raw: RawCoinpaymentsInvoice = {
      id: 'inv-004',
      status: 'cancelled',
      currency: { id: 'USD', symbol: 'USD' },
      amount: {
        total: { currencyId: 'USD', value: '2000', displayValue: '20.00' },
      },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps "timedout" invoice to status "failed"', () => {
    const raw: RawCoinpaymentsInvoice = {
      id: 'inv-005',
      status: 'timedout',
      currency: { id: 'USD', symbol: 'USD' },
      amount: {
        total: { currencyId: 'USD', value: '3000', displayValue: '30.00' },
      },
      description: 'Invoice timed out',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.description).toBe('Invoice timed out')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
