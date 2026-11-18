import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/monday-crm/transform/contact'
import type { MondayItem } from '../../../../../../../src/verticals/crm/adapters/monday-crm/client'

function makeRaw(overrides: Partial<MondayItem> = {}): MondayItem {
  return { id: 'mi-1', name: '', column_values: [], ...overrides }
}

describe('monday-crm transformContact', () => {
  it('maps id', () => {
    expect(transformContact(makeRaw({ id: 'mi-1' })).id).toBe('mi-1')
  })

  it('splits name into first_name and last_name', () => {
    const result = transformContact(makeRaw({ name: 'John Doe' }))
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBe('Doe')
  })

  it('extracts email from column_values', () => {
    const result = transformContact(makeRaw({
      column_values: [{ id: 'email', text: 'j@example.com', type: 'email', value: '{}' }],
    }))
    expect(result.email).toBe('j@example.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw as unknown as Record<string, unknown>)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw({ id: 'mi-1' }))
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('monday-crm untransformContact', () => {
  it('produces name and column_values string', () => {
    const result = untransformContact({ first_name: 'Jane', last_name: 'Doe' })
    expect(result.name).toBe('Jane Doe')
    expect(typeof result.column_values).toBe('string')
  })
})
