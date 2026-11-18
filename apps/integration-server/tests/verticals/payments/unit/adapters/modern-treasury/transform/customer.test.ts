import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawModernTreasuryCounterparty,
} from '../../../../../../../src/verticals/payments/adapters/modern-treasury/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

/**
 * Fixture: the documented `counterparty` object (required fields of the
 * `counterparty` schema in github.com/Modern-Treasury/modern-treasury-openapi,
 * openapi/mt_openapi_spec_v1.yaml), as returned by GET /api/counterparties.
 */
const COUNTERPARTY: RawModernTreasuryCounterparty = {
  id: '37ba4454-dd33-4aa0-8906-0e2e4103e45c',
  object: 'counterparty',
  live_mode: true,
  created_at: '2026-03-01T12:00:00Z',
  updated_at: '2026-03-02T08:30:00Z',
  discarded_at: null,
  name: 'Kenner, Bach and Ledeen',
  accounts: [],
  email: 'accounts@kbl.example',
  legal_entity_id: null,
  metadata: { foo: 'bar', modern: 'treasury' },
  external_id: null,
  send_remittance_advice: false,
  verification_status: 'unverified',
}

describe('modern-treasury transformCustomer', () => {
  it('maps a documented counterparty', () => {
    const result = CustomerSchema.parse(transformCustomer(COUNTERPARTY))
    expect(result).toMatchObject({
      id: COUNTERPARTY.id,
      externalId: COUNTERPARTY.id,
      name: 'Kenner, Bach and Ledeen',
      email: 'accounts@kbl.example',
      gateway: 'modern-treasury',
      metadata: { foo: 'bar', modern: 'treasury' },
      createdAt: '2026-03-01T12:00:00Z',
      updatedAt: '2026-03-02T08:30:00Z',
    })
  })

  it('omits the nullable name and email when they are null', () => {
    const result = CustomerSchema.parse(
      transformCustomer({ ...COUNTERPARTY, name: null, email: null }),
    )
    expect(result.name).toBeUndefined()
    expect(result.email).toBeUndefined()
  })

  it('refuses a counterparty without an id', () => {
    expect(() => transformCustomer({ ...COUNTERPARTY, id: '' })).toThrow(/no id/)
  })
})
