import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type ProcountorCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/creditmemo'

function makeCreditMemo(overrides: Partial<ProcountorCreditMemo> = {}): ProcountorCreditMemo {
  return {
    id: 9001,
    invoiceNumber: 7001,
    partnerId: 500,
    currency: 'EUR',
    date: '2024-03-01',
    dueDate: '2024-03-31',
    sum: -10000,
    vatAmount: -2000,
    openSum: -10000,
    paidSum: 0,
    status: 'APPROVED',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('9001')
  })

  it('maps invoiceNumber to creditmemoNumber as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('7001')
  })

  it('maps partnerId to contactId as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('500')
  })

  it('maps sum to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(-10000)
  })

  it('maps vatAmount to taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(-2000)
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('EUR')
  })

  it('maps EMPTY status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'EMPTY' })).status).toBe('DRAFT')
  })

  it('maps UNFINISHED status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'UNFINISHED' })).status).toBe('DRAFT')
  })

  it('maps APPROVED status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'APPROVED' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps PARTLYPAID status to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'PARTLYPAID' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps date to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-01')).toBe(true)
  })

  it('maps dueDate to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-03-31')).toBe(true)
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
