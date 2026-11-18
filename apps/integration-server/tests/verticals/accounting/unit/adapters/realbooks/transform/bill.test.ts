import { describe, it, expect } from 'vitest'
import {
  transformBill,
  untransformBill,
} from '../../../../../../../src/verticals/accounting/adapters/realbooks/transform/bill'
import type { RealBooksInvoice } from '../../../../../../../src/verticals/accounting/adapters/realbooks/transform/invoice'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makePurchaseVoucher(overrides: Partial<RealBooksInvoice> = {}): RealBooksInvoice {
  return {
    id: 501,
    transactionNumber: 'PURCH-2024-001',
    transactionDate: '15-03-2024',
    transactionDescription: 'Raw material purchase',
    transactionType: 'Purchase',
    partyLedger: { id: 10, ledgerName: 'Steel Suppliers Ltd' },
    currencySymbol: 'INR',
    itemDetails: [
      {
        rowId: 1,
        itemName: 'Steel Rods',
        itemCode: 'STL-001',
        itemDescription: '10mm steel rods',
        itemRate: 500.0,
        quantity: 100,
        discountAmount: 0,
        itemAmount: 50000.0,
        itemGrossAmount: 50000.0,
        itemTax: [{ taxLedgerName: 'GST 18%', taxAmount: 9000.0, rate: 18 }],
      },
    ],
    accountsTransaction: {
      id: 601,
      transactionDate: '15-03-2024',
      transactionNumber: 'PURCH-2024-001',
      transactionType: 'Purchase',
      ledgerDetails: [
        {
          ledger: { id: 10, ledgerName: 'Steel Suppliers Ltd' },
          amountType: 'cr',
          amount: 59000.0,
        },
        { ledger: 'Purchase Account', amountType: 'dr', amount: 59000.0 },
      ],
    },
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id as string', () => {
    expect(transformBill(makePurchaseVoucher()).id).toBe('501')
  })

  it('maps transactionNumber to billNumber', () => {
    expect(transformBill(makePurchaseVoucher()).billNumber).toBe('PURCH-2024-001')
  })

  it('maps partyLedger.ledgerName to contactId', () => {
    expect(transformBill(makePurchaseVoucher()).contactId).toBe('Steel Suppliers Ltd')
  })

  it('maps currencySymbol to currency', () => {
    expect(transformBill(makePurchaseVoucher()).currency).toBe('INR')
  })

  it('computes totalAmount from credit legs of accountsTransaction (in minor units)', () => {
    // credit leg: 59000.00 INR → 5900000 minor units
    expect(transformBill(makePurchaseVoucher()).totalAmount).toBe(5900000)
  })

  it('always sets status to AUTHORIZED', () => {
    expect(transformBill(makePurchaseVoucher()).status).toBe('AUTHORIZED')
  })

  it('maps transactionDescription to notes', () => {
    expect(transformBill(makePurchaseVoucher()).notes).toBe('Raw material purchase')
  })

  it('parses DD-MM-YYYY transactionDate to postedAt', () => {
    expect(transformBill(makePurchaseVoucher()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps itemDetails to lineItems with minor unit amounts', () => {
    const result = transformBill(makePurchaseVoucher())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].id).toBe('1')
    expect(result.lineItems?.[0].itemName).toBe('Steel Rods')
    // itemCode in the raw object maps to itemId in the canonical lineitem
    expect(result.lineItems?.[0].itemId).toBe('STL-001')
    expect(result.lineItems?.[0].unitAmount).toBe(50000)
    expect(result.lineItems?.[0].totalAmount).toBe(5000000)
  })

  it('maps itemTax to lineitem taxAmount in minor units', () => {
    const result = transformBill(makePurchaseVoucher())
    expect(result.lineItems?.[0].taxAmount).toBe(900000)
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseVoucher()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces output that passes BillSchema validation', () => {
    expect(() => BillSchema.parse(transformBill(makePurchaseVoucher()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformBill({ transactionNumber: 'PUR-001' })
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})

describe('untransformBill', () => {
  it('round-trips contactId back to partyLedger.ledgerName', () => {
    const bill = transformBill(makePurchaseVoucher())
    const raw = untransformBill(bill)
    expect((raw['partyLedger'] as Record<string, unknown>)['ledgerName']).toBe(
      'Steel Suppliers Ltd',
    )
  })

  it('sets transactionType to Purchase', () => {
    expect(untransformBill(transformBill(makePurchaseVoucher()))['transactionType']).toBe(
      'Purchase',
    )
  })

  it('converts minor unit amounts back to major units in itemDetails', () => {
    const bill = transformBill(makePurchaseVoucher())
    const raw = untransformBill(bill)
    const items = raw['itemDetails'] as Array<Record<string, unknown>>
    expect(items[0]['itemRate']).toBe(500)
  })
})
