import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawTapInvoice,
} from '../../../../../../../src/verticals/payments/adapters/tap-payments/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('tap-payments transformInvoice', () => {
  it('maps a PAID invoice to status "paid" with correct totals', () => {
    const raw: RawTapInvoice = {
      id: 'inv_001',
      status: 'PAID',
      amount: 100,
      currency: 'AED',
      customer: { id: 'cus_001' },
      // Unix timestamp for 2024-03-01
      created: 1709251200,
      updated: 1709251200,
      track: { time: 1709251200 },
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(result.total).toBe(10000)
    expect(result.amountPaid).toBe(10000)
    expect(result.amountDue).toBe(0)
    expect(result.customerId).toBe('cus_001')
    expect(result.gateway).toBe('tap-payments')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a SAVED invoice to status "draft"', () => {
    const raw: RawTapInvoice = {
      id: 'inv_002',
      status: 'SAVED',
      amount: 200,
      currency: 'USD',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('draft')
    expect(result.amountDue).toBe(20000)
    expect(result.amountPaid).toBe(0)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a CREATED invoice to status "open"', () => {
    const raw: RawTapInvoice = {
      id: 'inv_003',
      status: 'CREATED',
      amount: 50,
      currency: 'AED',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.amountRemaining).toBe(5000)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED invoice to status "void"', () => {
    const raw: RawTapInvoice = {
      id: 'inv_004',
      status: 'CANCELLED',
      amount: 75,
      currency: 'AED',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('converts dueDate from Unix timestamp (seconds)', () => {
    const raw: RawTapInvoice = {
      id: 'inv_005',
      status: 'CREATED',
      amount: 30,
      currency: 'AED',
      // 2024-03-01 in seconds
      due: 1709251200,
    }
    const result = transformInvoice(raw)
    // dueDate should be a valid ISO datetime
    expect(result.dueDate).toBeDefined()
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
