import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type FakturoidCreditMemo,
  type FakturoidCreditMemoLine,
} from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/creditmemo'

function makeCreditMemoLine(overrides: Partial<FakturoidCreditMemoLine> = {}): FakturoidCreditMemoLine {
  return {
    id: 801,
    name: 'Credit adjustment',
    quantity: 1,
    unit_price: -5000,
    vat_rate: 21,
    unit_price_without_vat: -5000,
    unit_price_with_vat: -6050,
    ...overrides,
  }
}

function makeCreditMemo(overrides: Partial<FakturoidCreditMemo> = {}): FakturoidCreditMemo {
  return {
    id: 8001,
    number: 'CN-2024-001',
    subject_id: 42,
    status: 'open',
    due_on: '2024-03-31',
    issued_on: '2024-03-01',
    total: -6050,
    remaining_amount: -6050,
    paid_amount: 0,
    currency: 'CZK',
    vat_price: -1050,
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('8001')
  })

  it('maps number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps subject_id to contactId as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('42')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('CZK')
  })

  it('maps amounts correctly', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(-6050)
    expect(cm.taxAmount).toBe(-1050)
    expect(cm.balanceAmount).toBe(-6050)
  })

  it('maps issued_on to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-01')).toBe(true)
  })

  it('maps due_on to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-03-31')).toBe(true)
  })

  it('maps status open to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status cancelled to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps lines to lineItems', () => {
    const raw = makeCreditMemo({ lines: [makeCreditMemoLine()] })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('801')
    expect(li.itemDescription).toBe('Credit adjustment')
    expect(li.unitQuantity).toBe(1)
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
