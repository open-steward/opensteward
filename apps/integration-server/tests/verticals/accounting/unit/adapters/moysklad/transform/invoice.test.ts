import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MoyskladInvoice } from '../../../../../../../src/verticals/accounting/adapters/moysklad/transform/invoice'

function makeInvoice(overrides: Partial<MoyskladInvoice> = {}): MoyskladInvoice {
  return {
    id: 'ms-001',
    name: 'МС-2024-001',
    moment: '2024-01-15T12:00:00.000+03:00',
    paymentPlannedMoment: '2024-02-15T12:00:00.000+03:00',
    sum: 123000,
    vatSum: 23000,
    applicable: true,
    counterparty: { meta: { href: 'https://api.moysklad.ru/api/remap/1.2/entity/counterparty/cust-42' } },
    currency: { name: 'RUB' },
    positions: { rows: [] },
    ...overrides,
  }
}

describe('transformInvoice (moysklad)', () => {
  it('maps id field', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('ms-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number from name field', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('МС-2024-001')
  })

  it('maps total amount dividing sum by 100', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1230)
  })

  it('maps tax amount dividing vatSum by 100', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(230)
  })

  it('maps AUTHORIZED status for applicable=true', () => {
    expect(transformInvoice(makeInvoice({ applicable: true })).status).toBe('AUTHORIZED')
  })

  it('maps DRAFT status for applicable=false', () => {
    expect(transformInvoice(makeInvoice({ applicable: false })).status).toBe('DRAFT')
  })

  it('maps contactId from last segment of counterparty href', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust-42')
  })

  it('maps currency from currency.name', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('RUB')
  })

  it('maps postedAt from moment field', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toBeInstanceOf(Date)
  })

  it('maps dueAt from paymentPlannedMoment field', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toBeInstanceOf(Date)
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
