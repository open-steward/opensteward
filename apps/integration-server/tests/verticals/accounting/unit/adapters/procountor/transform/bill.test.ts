import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type ProcountorBill,
} from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/bill'

function makeBill(overrides: Partial<ProcountorBill> = {}): ProcountorBill {
  return {
    id: 2001,
    invoiceNumber: 6001,
    partnerId: 300,
    currency: 'EUR',
    date: '2024-02-01',
    dueDate: '2024-03-01',
    sum: 5000,
    vatAmount: 1000,
    openSum: 5000,
    paidSum: 0,
    status: 'APPROVED',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id as string', () => {
    expect(transformBill(makeBill()).id).toBe('2001')
  })

  it('maps invoiceNumber to billNumber as string', () => {
    expect(transformBill(makeBill()).billNumber).toBe('6001')
  })

  it('maps partnerId to contactId as string', () => {
    expect(transformBill(makeBill()).contactId).toBe('300')
  })

  it('maps amount fields correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(5000)
    expect(b.taxAmount).toBe(1000)
    expect(b.balanceAmount).toBe(5000)
    expect(b.currency).toBe('EUR')
  })

  it('parses dates as Date objects', () => {
    const b = transformBill(makeBill())
    expect(b.postedAt).toEqual(new Date('2024-02-01'))
    expect(b.dueAt).toEqual(new Date('2024-03-01'))
  })

  it('maps EMPTY status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'EMPTY' })).status).toBe('DRAFT')
  })

  it('maps UNFINISHED status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'UNFINISHED' })).status).toBe('DRAFT')
  })

  it('maps APPROVED status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'APPROVED' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status to PAID', () => {
    expect(transformBill(makeBill({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps PARTLYPAID status to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'PARTLYPAID' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps CREDITED status to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'CREDITED' })).status).toBe('VOIDED')
  })

  it('returns undefined currency when empty', () => {
    expect(transformBill(makeBill({ currency: '' })).currency).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
