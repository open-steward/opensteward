import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type MezanCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/mezan/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

// NOTE: Mezan passes unit_price and subtotal_including_tax directly as
// canonical unitAmount/totalAmount (integer-only). Use integer values so
// CreditMemoSchema.parse() passes.

function makeCreditNote(overrides: Partial<MezanCreditNote> = {}): MezanCreditNote {
  return {
    id: 'cm_001',
    reference: 'CM-100',
    status: 'confirmed',
    issue_date: '2024-03-10',
    customer_id: 'cust_42',
    currency: 'USD',
    total: 50000,
    total_tax: 5000,
    total_paid: 50000,
    balance: 0,
    products: [],
    ...overrides,
  }
}

describe('transformCreditMemo (mezan)', () => {
  it('maps id as string', () => {
    expect(transformCreditMemo(makeCreditNote()).id).toBe('cm_001')
  })

  it('maps reference to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditNote()).creditmemoNumber).toBe('CM-100')
  })

  it('falls back to id as creditmemoNumber when reference is absent', () => {
    expect(transformCreditMemo(makeCreditNote({ reference: undefined })).creditmemoNumber).toBe(
      'cm_001',
    )
  })

  it('maps customer_id to contactId as string', () => {
    expect(transformCreditMemo(makeCreditNote()).contactId).toBe('cust_42')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditNote()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(50000)
  })

  it('maps total_tax to taxAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).taxAmount).toBe(5000)
  })

  it('maps total_paid to paidAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).paidAmount).toBe(50000)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).balanceAmount).toBe(0)
  })

  it('maps issue_date to postedAt as Date', () => {
    expect(transformCreditMemo(makeCreditNote()).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps confirmed + balance=0 to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'confirmed', balance: 0 })).status).toBe(
      'PAID',
    )
  })

  it('maps confirmed + partial balance to PARTIALLY_PAID', () => {
    expect(
      transformCreditMemo(makeCreditNote({ status: 'confirmed', balance: 25000, total: 50000 }))
        .status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps confirmed + full balance to AUTHORIZED', () => {
    expect(
      transformCreditMemo(makeCreditNote({ status: 'confirmed', balance: 50000, total: 50000 }))
        .status,
    ).toBe('AUTHORIZED')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps line items with integer amounts (schema-valid)', () => {
    const raw = makeCreditNote({
      products: [
        {
          id: 'p1',
          product_name: 'Refund Widget',
          quantity: 1,
          unit_price: 50000,
          subtotal: 50000,
          subtotal_including_tax: 55000,
          tax_subtotal: 5000,
        },
      ],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('p1')
    expect(result.lineItems![0].unitAmount).toBe(50000)
    expect(result.lineItems![0].totalAmount).toBe(55000)
    expect(result.lineItems![0].taxAmount).toBe(5000)
  })

  it('maps transaction_note to notes', () => {
    expect(
      transformCreditMemo(makeCreditNote({ transaction_note: 'Credit for over-billing' })).notes,
    ).toBe('Credit for over-billing')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditNote()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('passes CreditMemoSchema validation with integer amounts', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeCreditNote()))).not.toThrow()
  })
})
