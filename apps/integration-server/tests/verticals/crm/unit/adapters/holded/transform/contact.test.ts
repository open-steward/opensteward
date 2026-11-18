import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/holded/transform/contact'

describe('holded transformContact', () => {
  it('maps raw contact to canonical Contact', () => {
    const raw = { id: 'abc123', name: 'Carlos García', email: 'carlos@example.com', phone: '+34600000000' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('abc123')
    expect(contact.name).toBe('Carlos García')
    expect(contact.email).toBe('carlos@example.com')
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms Contact to holded payload', () => {
    const out = untransformContact({ name: 'María', email: 'maria@example.com' })
    expect(out['name']).toBe('María')
    expect(out['email']).toBe('maria@example.com')
    expect(out['type']).toBe('contact')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'abc123', name: 'Carlos García', email: 'carlos@example.com', phone: '+34600000000' }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
