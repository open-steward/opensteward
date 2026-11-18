import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformSettlementToInvoice,
  type A2xSettlement,
  type A2xSettlementLine,
} from '../../../../../../../src/verticals/accounting/adapters/a2x/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeSettlementLine(overrides: Partial<A2xSettlementLine> = {}): A2xSettlementLine {
  return {
    id: 10,
    description: 'Product sales',
    account_code: '4000',
    amount: 120.5,
    tax_amount: 10.5,
    ...overrides,
  }
}

function makeA2xSettlement(overrides: Partial<A2xSettlement> = {}): A2xSettlement {
  return {
    id: 5001,
    status: 'approved',
    settlement_start: '2024-02-01T00:00:00.000Z',
    settlement_end: '2024-02-15T00:00:00.000Z',
    settlement_id: 'AMZ-1234',
    currency: 'USD',
    total: 1200.0,
    total_tax: 100.0,
    total_fees: 50.0,
    lines: [makeSettlementLine()],
    posted_at: '2024-02-20T00:00:00.000Z',
    created_at: '2024-02-01T00:00:00.000Z',
    updated_at: '2024-02-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformSettlementToInvoice (a2x)', () => {
  it('maps id as string', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ id: 5001 }))
    expect(result.id).toBe('5001')
  })

  it('sets type to INVOICE', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement())
    expect(result.type).toBe('INVOICE')
  })

  it('maps settlement_id to invoiceNumber', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement())
    expect(result.invoiceNumber).toBe('AMZ-1234')
  })

  it('maps total to totalAmount as integer minor units', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ total: 1200.0 }))
    expect(result.totalAmount).toBe(120000)
  })

  it('maps settlement_start to postedAt', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString()).toBe('2024-02-01T00:00:00.000Z')
  })

  it('maps settlement_end to dueAt', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString()).toBe('2024-02-15T00:00:00.000Z')
  })

  it('maps posted_at to paidAt', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement())
    expect(result.paidAt).toBeInstanceOf(Date)
    expect(result.paidAt?.toISOString()).toBe('2024-02-20T00:00:00.000Z')
  })

  it('sets status PAID for approved', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ status: 'approved' }))
    expect(result.status).toBe('PAID')
  })

  it('sets status PAID for sent', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ status: 'sent' }))
    expect(result.status).toBe('PAID')
  })

  it('sets status SUBMITTED for sending', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ status: 'sending' }))
    expect(result.status).toBe('SUBMITTED')
  })

  it('sets status DRAFT for not_sent', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ status: 'not_sent' }))
    expect(result.status).toBe('DRAFT')
  })

  it('sets status DRAFT for failed', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ status: 'failed' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement())
    expect(result.lineItems).toHaveLength(1)
    const line = result.lineItems![0]
    expect(line.id).toBe('10')
    expect(line.itemDescription).toBe('Product sales')
    expect(line.accountId).toBe('4000')
    expect(line.totalAmount).toBe(12050)
    expect(line.taxAmount).toBe(1050)
  })

  it('returns empty array when lines is undefined', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ lines: undefined }))
    expect(result.lineItems).toEqual([])
  })

  it('sets paidAt undefined when posted_at is null', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ posted_at: null }))
    expect(result.paidAt).toBeUndefined()
  })

  it('maps currency', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ currency: 'GBP' }))
    expect(result.currency).toBe('GBP')
  })

  it('passes InvoiceSchema.parse for a decimal total (converted to integer minor units)', () => {
    const result = transformSettlementToInvoice(makeA2xSettlement({ total: 1200.5 }))
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('passes InvoiceSchema.parse for a whole-number total', () => {
    const result = transformSettlementToInvoice(
      makeA2xSettlement({ total: 1200, total_tax: 100, lines: undefined }),
    )
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
