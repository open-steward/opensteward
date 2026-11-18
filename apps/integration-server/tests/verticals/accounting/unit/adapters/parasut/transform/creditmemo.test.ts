import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type ParasutCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/creditmemo'

function makeCreditMemo(overrides: Partial<ParasutCreditMemo> = {}): ParasutCreditMemo {
  return {
    id: 'cm_1',
    type: 'e_invoices',
    attributes: {
      item_type: 'refund',
      status: 'sent',
      invoice_no: 'CN-001',
      gross_total: 500,
      vat_total: 90,
      issue_date: '2024-04-01',
      due_date: '2024-04-30',
      currency: 'TRY',
      contact_id: 'cust_10',
    },
    ...overrides,
  }
}

describe('transformCreditMemo (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm_1')
  })

  it('maps creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-001')
  })

  it('maps totalAmount and taxAmount', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(500)
    expect(cm.taxAmount).toBe(90)
  })

  it('maps contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('cust_10')
  })

  it('maps sent status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo()).status).toBe('AUTHORIZED')
  })

  it('maps draft status to DRAFT', () => {
    const raw = makeCreditMemo({ attributes: { ...makeCreditMemo().attributes, status: 'draft' } })
    expect(transformCreditMemo(raw).status).toBe('DRAFT')
  })

  it('maps paid status to PAID', () => {
    const raw = makeCreditMemo({ attributes: { ...makeCreditMemo().attributes, status: 'paid' } })
    expect(transformCreditMemo(raw).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    const raw = makeCreditMemo({ attributes: { ...makeCreditMemo().attributes, status: 'cancelled' } })
    expect(transformCreditMemo(raw).status).toBe('VOIDED')
  })

  it('parses dates as Date objects', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.postedAt).toEqual(new Date('2024-04-01'))
    expect(cm.dueAt).toEqual(new Date('2024-04-30'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
