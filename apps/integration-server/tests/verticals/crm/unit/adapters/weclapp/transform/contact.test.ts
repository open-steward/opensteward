import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/weclapp/transform/contact'

describe('weclapp transformContact', () => {
  it('maps PERSON customer to canonical Contact', () => {
    const raw = { id: 'C-001', firstName: 'Greta', lastName: 'Schmidt', email: 'greta@example.de', phone: '+4989000000', partyType: 'PERSON' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('C-001')
    expect(contact.first_name).toBe('Greta')
    expect(contact.last_name).toBe('Schmidt')
    expect(contact.metadata).toBe(raw)
  })

  it('builds full name', () => {
    const raw = { id: 'C-002', firstName: 'Karl', lastName: 'Meyer', partyType: 'PERSON' }
    const contact = transformContact(raw)
    expect(contact.name).toBe('Karl Meyer')
  })

  it('maps salesManager to owner_id', () => {
    const raw = { id: 'C-003', partyType: 'PERSON', salesManager: { id: 'user-5' } }
    const contact = transformContact(raw)
    expect(contact.owner_id).toBe('user-5')
  })

  it('untransforms Contact to weclapp payload', () => {
    const out = untransformContact({ first_name: 'Anna', email: 'anna@example.de' })
    expect(out['firstName']).toBe('Anna')
    expect(out['email']).toBe('anna@example.de')
    expect(out['partyType']).toBe('PERSON')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'C-001', firstName: 'Greta', lastName: 'Schmidt', email: 'greta@example.de', phone: '+4989000000', partyType: 'PERSON' }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
