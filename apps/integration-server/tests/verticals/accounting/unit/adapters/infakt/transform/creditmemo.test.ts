import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type InfaktCorrectiveInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/infakt/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCreditMemo(overrides: Partial<InfaktCorrectiveInvoice> = {}): InfaktCorrectiveInvoice {
  return {
    uuid: 'cm-uuid-001',
    number: 'KOR/10/2024',
    status: 'sent',
    currency: 'PLN',
    invoice_date: '2024-11-01',
    payment_date: '2024-11-15',
    paid_date: null,
    net_price: 8130, // already in groszy (minor units)
    tax_price: 1870,
    gross_price: 10000,
    left_to_pay: 10000,
    client_id: 77,
    notes: 'Credit for order 123',
    payment_method: 'transfer',
    services: [
      {
        name: 'Returned item',
        tax_symbol: '23',
        unit: 'szt.',
        quantity: 1,
        unit_net_price: 8130,
        net_price: 8130,
        gross_price: 10000,
        tax_price: 1870,
        discount: null,
      },
    ],
    corrected_invoice_number: 'FV/5/2024',
    corrected_invoice_date: '2024-10-15',
    correction_reason: 'mistake',
    confirmation: null,
    confirmation_date: null,
    created_at: '2024-11-01T09:00:00.000Z',
    ...overrides,
  }
}

describe('transformCreditMemo (infakt)', () => {
  it('maps uuid to id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-uuid-001')
  })

  it('maps number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('KOR/10/2024')
  })

  it('maps client_id to contactId as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('77')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('PLN')
  })

  it('passes gross_price directly as totalAmount (already in groszy)', () => {
    expect(transformCreditMemo(makeCreditMemo({ gross_price: 10000 })).totalAmount).toBe(10000)
  })

  it('passes tax_price directly as taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(1870)
  })

  it('passes left_to_pay directly as balanceAmount', () => {
    expect(transformCreditMemo(makeCreditMemo({ left_to_pay: 10000 })).balanceAmount).toBe(10000)
  })

  it('computes paidAmount as gross_price - left_to_pay', () => {
    const result = transformCreditMemo(makeCreditMemo({ gross_price: 10000, left_to_pay: 4000 }))
    expect(result.paidAmount).toBe(6000)
  })

  it('maps sent status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to AUTHORIZED (default)', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'unknown_xyz' })).status).toBe('AUTHORIZED')
  })

  it('maps invoice_date to postedAt via toIsoDatetime', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-11-01T00:00:00.000Z'))
  })

  it('maps payment_date to dueAt', () => {
    expect(transformCreditMemo(makeCreditMemo()).dueAt).toEqual(
      new Date('2024-11-15T00:00:00.000Z'),
    )
  })

  it('maps created_at to createdAt', () => {
    expect(transformCreditMemo(makeCreditMemo()).createdAt).toEqual(
      new Date('2024-11-01T09:00:00.000Z'),
    )
  })

  it('maps services to lineItems', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.itemName).toBe('Returned item')
    expect(li.totalAmount).toBe(10000)
    expect(li.taxAmount).toBe(1870)
  })

  it('maps corrected_invoice_number to a number-only appliedTo entry', () => {
    const out = CreditMemoSchema.parse(transformCreditMemo(makeCreditMemo()))
    // corrected_invoice_date is the corrected invoice's own date, not an
    // application date, so no appliedAt.
    expect(out.appliedTo).toEqual([{ invoiceNumber: 'FV/5/2024' }])
  })

  it('adds the invoice id from the show-only corrected_invoice_uuid', () => {
    const out = CreditMemoSchema.parse(
      transformCreditMemo(
        makeCreditMemo({ corrected_invoice_uuid: '7b1c9e2a-4f0d-4c8e-9a51-2d6f3b8e1c07' }),
      ),
    )
    expect(out.appliedTo).toEqual([
      { invoiceId: '7b1c9e2a-4f0d-4c8e-9a51-2d6f3b8e1c07', invoiceNumber: 'FV/5/2024' },
    ])
  })

  it('keeps an id-only link when the number is missing', () => {
    const out = CreditMemoSchema.parse(
      transformCreditMemo(
        makeCreditMemo({ corrected_invoice_number: null, corrected_invoice_uuid: 'inv-uuid-1' }),
      ),
    )
    expect(out.appliedTo).toEqual([{ invoiceId: 'inv-uuid-1' }])
  })

  it('omits appliedTo when neither corrected_invoice_number nor _uuid is set', () => {
    const out = CreditMemoSchema.parse(
      transformCreditMemo(
        makeCreditMemo({ corrected_invoice_number: null, corrected_invoice_uuid: null }),
      ),
    )
    expect(out.appliedTo).toBeUndefined()
  })

  it('maps notes', () => {
    expect(transformCreditMemo(makeCreditMemo()).notes).toBe('Credit for order 123')
  })

  it('produces a schema-valid CreditMemo', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeCreditMemo()))).not.toThrow()
  })
})
