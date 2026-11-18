import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type EcountInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/invoice'

function makeRaw(overrides: Partial<EcountInvoice> = {}): EcountInvoice {
  return {
    SLIP_NO: 'SL-2024-001',
    IO_DATE: '2024-01-15',
    DUE_DATE: '2024-02-15',
    CUST_CODE: 'CUST-001',
    CUST_NAME: 'Acme Korea Ltd',
    SUPPLY_AMT: 100000,
    VAT_AMT: 10000,
    TOTAL_AMT: 110000,
    UNPAID_AMT: 110000,
    STATUS: '02',
    CRNC_CODE: 'KRW',
    ITEM_LIST: [],
    ...overrides,
  }
}

describe('transformInvoice (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('SL-2024-001')
    expect(result.invoiceNumber).toBe('SL-2024-001')
    expect(result.contactId).toBe('CUST-001')
    expect(result.totalAmount).toBe(110000)
    expect(result.taxAmount).toBe(10000)
    expect(result.balanceAmount).toBe(110000)
    expect(result.currency).toBe('KRW')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('maps STATUS 01 to DRAFT', () => {
    const result = transformInvoice(makeRaw({ STATUS: '01' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps STATUS 02 to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ STATUS: '02' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps STATUS 03 to PAID', () => {
    const result = transformInvoice(makeRaw({ STATUS: '03' }))
    expect(result.status).toBe('PAID')
  })

  it('maps STATUS 04 to VOIDED', () => {
    const result = transformInvoice(makeRaw({ STATUS: '04' }))
    expect(result.status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps ITEM_LIST to lineItems', () => {
    const raw = makeRaw({
      ITEM_LIST: [
        {
          PROD_CODE: 'PROD-001',
          PROD_NAME: 'Widget',
          QTY: 10,
          PRICE: 10000,
          SUPPLY_AMT: 100000,
          VAT_AMT: 10000,
          AMOUNT: 100000,
          ACCOUNT_CODE: 'ACC-400',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('PROD-001')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(10000)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(100000)
    expect(li.taxAmount).toBe(10000)
    expect(li.accountId).toBe('ACC-400')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
