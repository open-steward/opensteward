/**
 * Fixture: the documented response example of GET /v1/chargebacks/{id}
 * https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api-payments/chargebacks/get-chargeback/get.md
 */
import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawMPChargeback,
} from '../../../../../../../src/verticals/payments/adapters/mercado-pago/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

const documented: RawMPChargeback = {
  id: '123456789',
  payments: [987654321],
  currency: 'BRL',
  amount: '50.00',
  reason: 'unauthorized',
  reason_id: '6',
  coverage_applied: true,
  coverage_eligible: true,
  documentation_required: true,
  documentation_status: 'pending',
  documentation: [
    {
      type: 'collector',
      url: 'https://storage.mlstatic.com/op/123/456789/comprobante.pdf',
      description: 'Comprobante de envío',
      uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    },
  ],
  date_documentation_deadline: '2024-02-15T23:59:59.000-03:00',
  date_created: '2024-02-01T10:30:00.000-03:00',
  date_last_updated: '2024-02-03T14:00:00.000-03:00',
  live_mode: true,
}

describe('mercado-pago transformDispute (documented chargeback case)', () => {
  it('parses against DisputeSchema', () => {
    const d = DisputeSchema.parse(transformDispute(documented))
    expect(d.id).toBe('123456789')
    expect(d.externalId).toBe('123456789')
    expect(d.gateway).toBe('mercado-pago')
  })

  it('takes chargeId from payments[0]', () => {
    expect(transformDispute(documented).chargeId).toBe('987654321')
  })

  it('keeps every associated payment in metadata', () => {
    const d = transformDispute({ ...documented, payments: [111, 222] })
    expect(d.chargeId).toBe('111')
    expect(d.metadata['payments']).toBe('111,222')
  })

  it('reads amount and currency from the documented fields', () => {
    const d = transformDispute(documented)
    expect(d.amount).toBe(5000)
    expect(d.currency).toBe('BRL')
    expect(transformDispute({ ...documented, amount: 12.34 }).amount).toBe(1234)
  })

  it('maps documentation_status to the dispute status', () => {
    expect(transformDispute(documented).status).toBe('needs_response')
    expect(transformDispute({ ...documented, documentation_status: 'review_pending' }).status).toBe(
      'under_review',
    )
    for (const s of ['valid', 'invalid', 'not_supplied', 'not_applicable']) {
      expect(transformDispute({ ...documented, documentation_status: s }).status).toBe('unknown')
    }
  })

  it('keeps the free-text reason in metadata, not the canonical reason', () => {
    const d = transformDispute(documented)
    expect(d.reason).toBeUndefined()
    expect(d.metadata['reason']).toBe('unauthorized')
    expect(d.metadata['reason_id']).toBe('6')
  })

  it('normalises the documented dates', () => {
    const d = transformDispute(documented)
    expect(d.createdAt).toBe('2024-02-01T13:30:00.000Z')
    expect(d.updatedAt).toBe('2024-02-03T17:00:00.000Z')
    expect(d.evidenceDueBy).toBe('2024-02-16T02:59:59.000Z')
    expect(
      transformDispute({ ...documented, date_documentation_deadline: null }).evidenceDueBy,
    ).toBe(undefined)
  })

  it.each([
    ['id', { id: undefined }],
    ['payments[0]', { payments: [] }],
    ['currency', { currency: undefined }],
    ['amount', { amount: undefined }],
    ['amount', { amount: '' }],
    ['amount', { amount: '  ' }],
    ['amount', { amount: 'abc' }],
  ])('throws rather than inventing a missing %s', (field, patch) => {
    expect(() => transformDispute({ ...documented, ...patch })).toThrow(field)
  })
})
