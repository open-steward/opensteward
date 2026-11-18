import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoiceDetails,
  transformInvoiceListItem,
  type BindInvoiceDetails,
  type BindInvoiceListItem,
} from '../../../../../../../src/verticals/accounting/adapters/bind-erp/transform/invoice'

function makeInvoiceDetails(overrides: Partial<BindInvoiceDetails> = {}): BindInvoiceDetails {
  return {
    ID: 'inv-1',
    UUID: 'uuid-inv-1',
    Series: 'A',
    Number: 101,
    ClientID: 'client-1',
    ClientName: 'Big Client',
    StatusCode: 1,
    CreationDate: '2024-05-01T00:00:00',
    ApplicationDate: '2024-05-02T00:00:00',
    CurrencyName: 'MXN',
    Subtotal: 1000,
    Discount: 50,
    VAT: 152,
    IEPS: 0,
    VATRet: 0,
    ISRRet: 0,
    Payments: 0,
    Products: [
      { ProductID: 'p1', Name: 'Widget', Code: 'WGT', Qty: 2, Price: 400, IndexNumber: 0 },
    ],
    Services: [
      { ServiceID: 's1', Name: 'Install', Code: 'INST', Qty: 1, Price: 200, IndexNumber: 1 },
    ],
    ...overrides,
  }
}

function makeInvoiceListItem(overrides: Partial<BindInvoiceListItem> = {}): BindInvoiceListItem {
  return {
    UUID: 'uuid-list-1',
    Serie: 'B',
    Number: 202,
    ClientID: 'client-2',
    Total: 2000,
    Status: 0,
    CurrencyID: 'MXN',
    Date: '2024-06-01T00:00:00',
    ExpirationDate: '2024-07-01T00:00:00',
    Payments: 500,
    VAT: 320,
    IEPS: 0,
    VATRet: 0,
    ISRRet: 0,
    ...overrides,
  }
}

describe('transformInvoiceDetails', () => {
  it('prefers ID over UUID for id', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails()).id).toBe('inv-1')
  })

  it('falls back to UUID when ID is absent', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails({ ID: undefined })).id).toBe('uuid-inv-1')
  })

  it('falls back to Number string when both ID and UUID are absent', () => {
    const inv = transformInvoiceDetails(makeInvoiceDetails({ ID: undefined, UUID: undefined }))
    expect(inv.id).toBe('101')
  })

  it('type is always INVOICE', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails()).type).toBe('INVOICE')
  })

  it('status is AUTHORIZED for StatusCode 1', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails({ StatusCode: 1 })).status).toBe('AUTHORIZED')
  })

  it('status is VOIDED for StatusCode 2', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails({ StatusCode: 2 })).status).toBe('VOIDED')
  })

  it('status is PAID for StatusCode 3', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails({ StatusCode: 3 })).status).toBe('PAID')
  })

  it('status defaults to AUTHORIZED when StatusCode is absent', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails({ StatusCode: undefined })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('concatenates Series and Number for invoiceNumber', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails()).invoiceNumber).toBe('A101')
  })

  it('uses Number alone when Series is absent', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails({ Series: undefined })).invoiceNumber).toBe(
      '101',
    )
  })

  it('maps ClientID to contactId', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails()).contactId).toBe('client-1')
  })

  it('maps CurrencyName to currency', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails()).currency).toBe('MXN')
  })

  it('computes totalAmount as Subtotal - Discount + VAT + IEPS - VATRet - ISRRet', () => {
    // 1000 - 50 + 152 + 0 - 0 - 0 = 1102
    expect(transformInvoiceDetails(makeInvoiceDetails()).totalAmount).toBe(1102)
  })

  it('computes taxAmount as VAT + IEPS - VATRet - ISRRet', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails()).taxAmount).toBe(152)
  })

  it('combines Products and Services into lineItems', () => {
    const inv = transformInvoiceDetails(makeInvoiceDetails())
    expect(inv.lineItems).toHaveLength(2)
    expect(inv.lineItems![0].itemId).toBe('p1')
    expect(inv.lineItems![1].itemId).toBe('s1')
  })

  it('uses IndexNumber as line item id', () => {
    const inv = transformInvoiceDetails(makeInvoiceDetails())
    expect(inv.lineItems![0].id).toBe('0')
    expect(inv.lineItems![1].id).toBe('1')
  })

  it('maps ApplicationDate to postedAt', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails()).postedAt).toEqual(
      new Date('2024-05-02T00:00:00'),
    )
  })

  it('maps CreationDate to createdAt', () => {
    expect(transformInvoiceDetails(makeInvoiceDetails()).createdAt).toEqual(
      new Date('2024-05-01T00:00:00'),
    )
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoiceDetails()
    expect(transformInvoiceDetails(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoiceDetails(makeInvoiceDetails())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

describe('transformInvoiceListItem', () => {
  it('uses UUID for id', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem()).id).toBe('uuid-list-1')
  })

  it('falls back to Serie+Number when UUID is absent', () => {
    const inv = transformInvoiceListItem(makeInvoiceListItem({ UUID: undefined }))
    expect(inv.id).toBe('B202')
  })

  it('type is always INVOICE', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem()).type).toBe('INVOICE')
  })

  it('status is AUTHORIZED for Status 0', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem({ Status: 0 })).status).toBe('AUTHORIZED')
  })

  it('status is VOIDED for Status 1', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem({ Status: 1 })).status).toBe('VOIDED')
  })

  it('status defaults to AUTHORIZED when Status is absent', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem({ Status: undefined })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('concatenates Serie and Number for invoiceNumber', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem()).invoiceNumber).toBe('B202')
  })

  it('uses Number alone when Serie is absent', () => {
    const inv = transformInvoiceListItem(makeInvoiceListItem({ Serie: undefined }))
    expect(inv.invoiceNumber).toBe('202')
  })

  it('maps ClientID to contactId', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem()).contactId).toBe('client-2')
  })

  it('maps CurrencyID to currency', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem()).currency).toBe('MXN')
  })

  it('uses Total field directly for totalAmount', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem()).totalAmount).toBe(2000)
  })

  it('maps Payments to paidAmount', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem()).paidAmount).toBe(500)
  })

  it('maps Date to postedAt', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem()).postedAt).toEqual(
      new Date('2024-06-01T00:00:00'),
    )
  })

  it('maps ExpirationDate to dueAt', () => {
    expect(transformInvoiceListItem(makeInvoiceListItem()).dueAt).toEqual(
      new Date('2024-07-01T00:00:00'),
    )
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoiceListItem()
    expect(transformInvoiceListItem(raw).metadata).toBe(raw)
  })
})
