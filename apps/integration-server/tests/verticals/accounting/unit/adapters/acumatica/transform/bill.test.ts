import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type AcumaticaBill } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/bill'

function makeBill(overrides: Partial<AcumaticaBill> = {}): AcumaticaBill {
  return {
    RefNbr: 'AP001234',
    Type: 'Bill',
    Status: 'Open',
    Amount: 800,
    TaxTotal: 100,
    Balance: 800,
    CurrencyID: 'USD',
    VendorID: 'VEND001',
    DocDate: '2024-03-01',
    DueDate: '2024-04-01',
    InvoiceNbr: 'BILL-001',
    Details: [],
    ...overrides,
  }
}

describe('transformBill (Acumatica)', () => {
  it('maps id from RefNbr', () => {
    expect(transformBill(makeBill()).id).toBe('AP001234')
  })

  it('maps billNumber from InvoiceNbr', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('maps contacts from VendorID', () => {
    expect(transformBill(makeBill()).contactId).toBe('VEND001')
  })

  it('maps totalAmount and taxAmount', () => {
    const result = transformBill(makeBill())
    expect(result.totalAmount).toBe(800)
    expect(result.taxAmount).toBe(100)
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('maps Open status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ Status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps Closed status to PAID', () => {
    expect(transformBill(makeBill({ Status: 'Closed' })).status).toBe('PAID')
  })

  it('maps Hold status to DRAFT', () => {
    expect(transformBill(makeBill({ Status: 'Hold' })).status).toBe('DRAFT')
  })

  it('maps Voided status to VOIDED', () => {
    expect(transformBill(makeBill({ Status: 'Voided' })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
