import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawMPAuthorizedPayment,
} from '../../../../../../../src/verticals/payments/adapters/mercado-pago/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('mercado-pago transformInvoice', () => {
  const base: RawMPAuthorizedPayment = {
    id: 555666777,
    type: 'recurring',
    date_created: '2024-04-01T00:00:00.000Z',
    last_modified: '2024-04-01T01:00:00.000Z',
    preapproval_id: 'preapproval-plan-abc',
    reason: 'Monthly subscription',
    external_reference: 'sub-ext-ref',
    currency_id: 'MXN',
    transaction_amount: 199.0,
    debit_date: '2024-04-05T00:00:00.000Z',
    retry_attempt: 0,
    status: 'processed',
    payment: { id: 888999000, status: 'approved', status_detail: 'accredited' },
  }

  it('maps id and subscriptionId from preapproval_id', () => {
    const result = transformInvoice(base)
    expect(result.id).toBe('555666777')
    expect(result.subscriptionId).toBe('preapproval-plan-abc')
  })

  it('maps processed status to paid', () => {
    const result = transformInvoice(base)
    expect(result.status).toBe('paid')
  })

  it('converts transaction_amount to total in minor units', () => {
    const result = transformInvoice(base)
    expect(result.total).toBe(19900) // 199.00 * 100
    expect(result.amountPaid).toBe(19900)
    expect(result.amountDue).toBe(0)
  })

  it('maps currency from currency_id', () => {
    const result = transformInvoice(base)
    expect(result.currency).toBe('MXN')
  })

  it('maps scheduled status to open', () => {
    const result = transformInvoice({ ...base, status: 'scheduled' })
    expect(result.status).toBe('open')
  })

  it('maps cancelled status to void', () => {
    const result = transformInvoice({ ...base, status: 'cancelled' })
    expect(result.status).toBe('void')
  })

  it('puts payment_id and retry_attempt in metadata', () => {
    const result = transformInvoice(base)
    expect(result.metadata['payment_id']).toBe('888999000')
    expect(result.metadata['retry_attempt']).toBe('0')
  })

  it('sets gateway to mercado-pago', () => {
    const result = transformInvoice(base)
    expect(result.gateway).toBe('mercado-pago')
  })

  it('conforms to InvoiceSchema', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(base))).not.toThrow()
  })
})
