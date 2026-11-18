import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawInsightlyContact,
} from '../../../../../../../src/verticals/crm/adapters/insightly/transform/contact'

function makeRaw(overrides: Partial<RawInsightlyContact> = {}): RawInsightlyContact {
  return { CONTACT_ID: 1, ...overrides }
}

describe('insightly transformContact', () => {
  it('maps CONTACT_ID to string id', () => {
    expect(transformContact(makeRaw({ CONTACT_ID: 42 })).id).toBe('42')
  })

  it('maps FIRST_NAME and LAST_NAME', () => {
    const result = transformContact(makeRaw({ FIRST_NAME: 'Jane', LAST_NAME: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('appends Z to timestamps without timezone', () => {
    const result = transformContact(makeRaw({ DATE_CREATED_UTC: '2024-01-01T00:00:00' }))
    expect(result.created_at).toBe('2024-01-01T00:00:00Z')
  })

  it('does not double-append Z', () => {
    const result = transformContact(makeRaw({ DATE_CREATED_UTC: '2024-01-01T00:00:00Z' }))
    expect(result.created_at).toBe('2024-01-01T00:00:00Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ CONTACT_ID: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('insightly untransformContact', () => {
  it('maps email to EMAIL_ADDRESS', () => {
    const result = untransformContact({ email: 'test@example.com' })
    expect(result.EMAIL_ADDRESS).toBe('test@example.com')
  })
})
