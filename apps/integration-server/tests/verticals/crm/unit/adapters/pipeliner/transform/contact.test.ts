import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawPipelinerContact,
} from '../../../../../../../src/verticals/crm/adapters/pipeliner/transform/contact'

function makeRaw(overrides: Partial<RawPipelinerContact> = {}): RawPipelinerContact {
  return { id: 'contact-1', ...overrides }
}

describe('pipeliner transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw({ id: 'c-42' })).id).toBe('c-42')
  })

  it('maps first_name and last_name', () => {
    const result = transformContact(makeRaw({ first_name: 'John', last_name: 'Smith' }))
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBe('Smith')
  })

  it('maps email from email1', () => {
    expect(transformContact(makeRaw({ email1: 'j@pipeliner.com' })).email).toBe('j@pipeliner.com')
  })

  it('maps company_id from account_id', () => {
    expect(transformContact(makeRaw({ account_id: 'acc-1' })).company_id).toBe('acc-1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 'c-42' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('pipeliner untransformContact', () => {
  it('maps email to email1', () => {
    const result = untransformContact({ email: 'a@b.com' })
    expect(result.email1).toBe('a@b.com')
  })
})
