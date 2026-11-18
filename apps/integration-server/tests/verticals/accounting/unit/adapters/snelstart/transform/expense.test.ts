import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type SnelStartExpense,
} from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/expense'

function makeExpense(overrides: Partial<SnelStartExpense> = {}): SnelStartExpense {
  return {
    id: 'exp-001',
    omschrijving: 'Kantoorbenodigdheden',
    relatie: { id: 'rel-3' },
    grootboekrekening: { id: 'acc-4100' },
    valutacode: 'EUR',
    factuurbedrag: 1500,
    btw: 315,
    factuurdatum: '2024-02-15',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id from raw id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp-001')
  })

  it('maps omschrijving to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Kantoorbenodigdheden')
  })

  it('maps grootboekrekening.id to accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('acc-4100')
  })

  it('maps relatie.id to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('rel-3')
  })

  it('maps valutacode to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('EUR')
  })

  it('maps factuurbedrag to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(1500)
  })

  it('maps btw to taxAmount', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(315)
  })

  it('maps factuurdatum to postedAt as Date', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-02-15')).toBe(true)
  })

  it('returns undefined postedAt when factuurdatum is empty', () => {
    expect(transformExpense(makeExpense({ factuurdatum: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined name when omschrijving is empty', () => {
    expect(transformExpense(makeExpense({ omschrijving: '' })).name).toBeUndefined()
  })

  it('returns undefined contactId when relatie is null', () => {
    expect(transformExpense(makeExpense({ relatie: null })).contactId).toBeUndefined()
  })

  it('returns undefined accountId when grootboekrekening is null', () => {
    expect(transformExpense(makeExpense({ grootboekrekening: null })).accountId).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
