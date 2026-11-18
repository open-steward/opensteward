import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact, type RawAttioContact } from '../../../../../../../src/verticals/crm/adapters/attio/transform/contact'

function makeRaw(overrides: Partial<RawAttioContact> = {}): RawAttioContact {
  return {
    id: { record_id: 'rec1' },
    values: {},
    ...overrides,
  }
}

describe('attio transformContact', () => {
  it('maps id from record_id', () => {
    expect(transformContact(makeRaw()).id).toBe('rec1')
  })

  it('maps email from email_addresses', () => {
    const raw = makeRaw({ values: { email_addresses: [{ original_email_address: 'j@a.com', attribute_type: 'email' }] } })
    expect(transformContact(raw).email).toBe('j@a.com')
  })

  it('maps first_name and last_name from value arrays', () => {
    const raw = makeRaw({
      values: {
        first_name: [{ value: 'Jane', attribute_type: 'text' }],
        last_name: [{ value: 'Doe', attribute_type: 'text' }],
      },
    })
    const result = transformContact(raw)
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransformContact returns data.values wrapper', () => {
    const result = untransformContact({ email: 'j@a.com' }) as { data: { values: Record<string, unknown> } }
    expect(result.data.values['email_addresses']).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
