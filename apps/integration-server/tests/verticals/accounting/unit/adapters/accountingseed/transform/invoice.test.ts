import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type AccountingSeedInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/invoice'

function makeInvoice(overrides: Partial<AccountingSeedInvoice> = {}): AccountingSeedInvoice {
  return {
    Id: 'a0C5e000002XYZ1',
    Name: 'INV-0001',
    AcctSeed__Customer__c: '0015e000003ABC1',
    AcctSeed__Status__c: 'Posted',
    AcctSeed__Date__c: '2024-03-01',
    AcctSeed__Due_Date__c: '2024-04-01',
    CurrencyIsoCode: 'USD',
    AcctSeed__Total__c: 1500,
    AcctSeed__Tax__c: 150,
    AcctSeed__Balance__c: 500,
    AcctSeed__Paid_Amount__c: 1000,
    AcctSeed__Reference__c: 'PO-12345',
    AcctSeed__Notes__c: 'Net 30',
    AcctSeed__Billing_Lines__r: {
      records: [
        {
          Id: 'line-001',
          Name: 'Line 1',
          AcctSeed__GL_Account__c: 'gl-001',
          AcctSeed__Product__c: 'prod-001',
          AcctSeed__Product_Name__c: 'Widget A',
          AcctSeed__Unit_Price__c: 100,
          AcctSeed__Quantity__c: 15,
          AcctSeed__Amount__c: 1500,
          AcctSeed__Tax_Amount__c: 150,
        },
      ],
    },
    CreatedDate: '2024-03-01T08:00:00.000Z',
    LastModifiedDate: '2024-03-15T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id from Id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('a0C5e000002XYZ1')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoiceNumber from Name', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-0001')
  })

  it('maps contactId from Customer__c', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('0015e000003ABC1')
  })

  it('maps status "Posted" to SUBMITTED', () => {
    expect(transformInvoice(makeInvoice({ AcctSeed__Status__c: 'Posted' })).status).toBe('SUBMITTED')
  })

  it('maps status "Paid" to PAID', () => {
    expect(transformInvoice(makeInvoice({ AcctSeed__Status__c: 'Paid' })).status).toBe('PAID')
  })

  it('maps status "Partially Paid" to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ AcctSeed__Status__c: 'Partially Paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status "Voided" to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ AcctSeed__Status__c: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps status "Overdue" to OVERDUE', () => {
    expect(transformInvoice(makeInvoice({ AcctSeed__Status__c: 'Overdue' })).status).toBe('OVERDUE')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ AcctSeed__Status__c: 'In Progress' })).status).toBe('DRAFT')
  })

  it('maps totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1500)
  })

  it('maps line items', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('line-001')
    expect(result.lineItems![0].itemName).toBe('Widget A')
    expect(result.lineItems![0].unitAmount).toBe(100)
    expect(result.lineItems![0].unitQuantity).toBe(15)
    expect(result.lineItems![0].totalAmount).toBe(1500)
  })

  it('maps dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
