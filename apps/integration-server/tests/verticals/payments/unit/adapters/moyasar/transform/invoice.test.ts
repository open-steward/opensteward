import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawMoyasarInvoice,
} from '../../../../../../../src/verticals/payments/adapters/moyasar/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('moyasar transformInvoice', () => {
  it('maps id, amount as total, currency (upper-cased), and status "paid"', () => {
    const raw: RawMoyasarInvoice = {
      id: 'inv-001',
      amount: 3000,
      currency: 'sar',
      status: 'paid',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv-001')
    expect(result.total).toBe(3000)
    expect(result.currency).toBe('SAR')
    expect(result.status).toBe('paid')
    expect(result.gateway).toBe('moyasar')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps status "cancelled" to "void"', () => {
    const raw: RawMoyasarInvoice = {
      id: 'inv-002',
      amount: 1000,
      currency: 'SAR',
      status: 'canceled',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('void')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps status "expired" to "uncollectible"', () => {
    const raw: RawMoyasarInvoice = {
      id: 'inv-003',
      amount: 500,
      currency: 'SAR',
      status: 'expired',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('uncollectible')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('maps status "initiated" to "open"', () => {
    const raw: RawMoyasarInvoice = {
      id: 'inv-004',
      amount: 700,
      currency: 'SAR',
      status: 'initiated',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
