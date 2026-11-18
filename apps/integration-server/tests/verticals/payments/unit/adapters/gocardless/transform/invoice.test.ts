import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawGCInstalmentSchedule,
} from '../../../../../../../src/verticals/payments/adapters/gocardless/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('gocardless transformInvoice', () => {
  it('maps an active instalment schedule to status "open"', () => {
    const raw: RawGCInstalmentSchedule = {
      id: 'IS001',
      name: 'Annual Plan',
      status: 'active',
      total_amount: 12000,
      currency: 'gbp',
      payment_reference: 'REF-001',
      links: { customer: 'CU001' },
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('IS001')
    expect(result.status).toBe('open')
    expect(result.total).toBe(12000)
    expect(result.currency).toBe('GBP')
    expect(result.customerId).toBe('CU001')
    expect(result.number).toBe('REF-001')
    expect(result.gateway).toBe('gocardless')
    expect(result.metadata.name).toBe('Annual Plan')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a pending schedule to status "open"', () => {
    const raw: RawGCInstalmentSchedule = {
      id: 'IS002',
      status: 'pending',
      total_amount: 6000,
      currency: 'eur',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a completed schedule to status "paid"', () => {
    const raw: RawGCInstalmentSchedule = {
      id: 'IS003',
      status: 'completed',
      total_amount: 9000,
      currency: 'gbp',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('paid')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled schedule to status "void"', () => {
    const raw: RawGCInstalmentSchedule = {
      id: 'IS004',
      status: 'cancelled',
      total_amount: 3000,
      currency: 'gbp',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
