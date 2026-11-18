import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawNimbleContact,
} from '../../../../../../../src/verticals/crm/adapters/nimble/transform/contact'

function makeRaw(overrides: Partial<RawNimbleContact> = {}): RawNimbleContact {
  return { id: 'n-1', ...overrides }
}

describe('nimble transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 'n-1' })).id).toBe('n-1')
  })

  it('extracts first_name from fields', () => {
    const result = transformContact(makeRaw({ fields: { first_name: [{ value: 'Jane' }] } }))
    expect(result.first_name).toBe('Jane')
  })

  it('extracts email from fields', () => {
    const result = transformContact(makeRaw({ fields: { email: [{ value: 'j@ex.com' }] } }))
    expect(result.email).toBe('j@ex.com')
  })

  it('maps owner_id', () => {
    expect(transformContact(makeRaw({ owner_id: '7' })).owner_id).toBe('7')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 'n-1' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('nimble untransformContact', () => {
  it('wraps email in fields array', () => {
    const result = untransformContact({ email: 'x@example.com' })
    const fields = result.fields as Record<string, Array<{ value: string }>>
    expect(fields.email[0].value).toBe('x@example.com')
  })
})
