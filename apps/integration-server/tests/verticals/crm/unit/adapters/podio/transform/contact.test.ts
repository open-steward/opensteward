import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/podio/transform/contact'
import type { PodioItem } from '../../../../../../../src/verticals/crm/adapters/podio/client'

function makeRaw(overrides: Partial<PodioItem> = {}): PodioItem {
  return { item_id: 1, fields: [], ...overrides }
}

describe('podio transformContact', () => {
  it('maps item_id to id string', () => {
    expect(transformContact(makeRaw({ item_id: 42 })).id).toBe('42')
  })

  it('extracts first name from fields', () => {
    const result = transformContact(makeRaw({
      fields: [{ external_id: 'first-name', values: [{ value: 'Alice' }] }],
    }))
    expect(result.first_name).toBe('Alice')
  })

  it('extracts email from fields', () => {
    const result = transformContact(makeRaw({
      fields: [{ external_id: 'email', values: [{ value: 'alice@podio.com' }] }],
    }))
    expect(result.email).toBe('alice@podio.com')
  })

  it('handles empty fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ item_id: 42 }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('podio untransformContact', () => {
  it('returns a fields envelope', () => {
    const result = untransformContact({ email: 'a@b.com' })
    expect(result).toHaveProperty('fields')
  })
})
