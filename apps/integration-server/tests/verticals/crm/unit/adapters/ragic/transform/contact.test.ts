import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/ragic/transform/contact'
import type { RagicRecord } from '../../../../../../../src/verticals/crm/adapters/ragic/client'

function makeRaw(overrides: Partial<RagicRecord> = {}): RagicRecord {
  return { _ragic_id: 1, ...overrides }
}

describe('ragic transformContact', () => {
  it('maps _ragic_id to id string', () => {
    expect(transformContact(makeRaw({ _ragic_id: 42 })).id).toBe('42')
  })

  it('maps First Name field', () => {
    expect(transformContact(makeRaw({ 'First Name': 'Alice' })).first_name).toBe('Alice')
  })

  it('maps Email field', () => {
    expect(transformContact(makeRaw({ 'Email': 'alice@ragic.com' })).email).toBe('alice@ragic.com')
  })

  it('maps Company ID field to company_id', () => {
    expect(transformContact(makeRaw({ 'Company ID': '99' })).company_id).toBe('99')
  })

  it('handles empty record gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ _ragic_id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('ragic untransformContact', () => {
  it('maps email to "Email" field key', () => {
    const result = untransformContact({ email: 'a@b.com' })
    expect(result['Email']).toBe('a@b.com')
  })
})
