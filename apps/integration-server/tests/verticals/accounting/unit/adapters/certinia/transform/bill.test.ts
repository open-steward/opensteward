import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type CertiniaBill } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/bill'

function makeBill(overrides: Partial<CertiniaBill> = {}): CertiniaBill {
  return {
    Id: 'b0B000000001',
    Name: 'BILL-2024-001',
    Status__c: 'Draft',
    Bill_Date__c: '2024-03-01',
    Due_Date__c: '2024-03-31',
    Amount__c: 3000,
    Tax_Amount__c: 300,
    Currency__c: 'USD',
    Vendor__c: 'VEND-001',
    Lines__r: null,
    ...overrides,
  }
}

describe('transformBill (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('b0B000000001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('VEND-001')
    expect(result.totalAmount).toBe(3000)
    expect(result.taxAmount).toBe(300)
    expect(result.currency).toBe('USD')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformBill(makeBill({ Status__c: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ Status__c: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformBill(makeBill({ Status__c: 'Paid' })).status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformBill(makeBill({ Status__c: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('returns empty lineItems when Lines__r is null', () => {
    expect(transformBill(makeBill({ Lines__r: null })).lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
