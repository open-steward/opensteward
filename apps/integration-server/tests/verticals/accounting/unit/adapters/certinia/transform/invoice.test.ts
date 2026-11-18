import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type CertiniaInvoice } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/invoice'

function makeInvoice(overrides: Partial<CertiniaInvoice> = {}): CertiniaInvoice {
  return {
    Id: 'a0A000000001',
    Name: 'INV-2024-001',
    Status__c: 'Draft',
    Invoice_Date__c: '2024-03-01',
    Due_Date__c: '2024-03-31',
    Amount__c: 5000,
    Tax_Amount__c: 500,
    Balance__c: 5000,
    Currency__c: 'USD',
    Account__c: 'ACCT-001',
    Lines__r: null,
    ...overrides,
  }
}

describe('transformInvoice (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('a0A000000001')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('ACCT-001')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(500)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ Status__c: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ Status__c: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ Status__c: 'Paid' })).status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ Status__c: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('maps Lines__r records to lineItems', () => {
    const raw = makeInvoice({
      Lines__r: {
        records: [
          {
            Id: 'LINE-001',
            Description__c: 'Consulting',
            Quantity__c: 2,
            Unit_Price__c: 1000,
            Total_Amount__c: 2000,
            Tax_Amount__c: 200,
            Account_Code__c: '4000',
          },
        ],
      },
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('LINE-001')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(2000)
    expect(li.taxAmount).toBe(200)
    expect(li.accountId).toBe('4000')
  })

  it('returns empty lineItems when Lines__r is null', () => {
    const result = transformInvoice(makeInvoice({ Lines__r: null }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
