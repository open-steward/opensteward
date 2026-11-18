import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/teamleader/transform/contact'

describe('teamleader transformContact', () => {
  it('maps contact to canonical Contact', () => {
    const raw = { id: 'tl-001', first_name: 'Jan', last_name: 'Janssen', emails: [{ email: 'jan@example.be' }], telephones: [{ number: '+3247000000' }] }
    const contact = transformContact(raw)
    expect(contact.id).toBe('tl-001')
    expect(contact.first_name).toBe('Jan')
    expect(contact.email).toBe('jan@example.be')
    expect(contact.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'tl-001', first_name: 'Jan', last_name: 'Janssen', emails: [{ email: 'jan@example.be' }], telephones: [{ number: '+3247000000' }] }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
