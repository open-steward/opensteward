import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact, untransformContact } from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/contact'

describe('ploomes transformContact', () => {
  it('maps raw Ploomes contact to canonical Contact', () => {
    const raw = {
      Id: 123,
      Name: 'Carlos Silva',
      Email: 'carlos@exemplo.com',
      Phone: '+5511987654321',
      AccountId: 55,
      OwnerId: 7,
      CreateDate: '2024-01-01T00:00:00Z',
      LastUpdateDate: '2024-06-01T00:00:00Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('123')
    expect(contact.name).toBe('Carlos Silva')
    expect(contact.email).toBe('carlos@exemplo.com')
    expect(contact.phone).toBe('+5511987654321')
    expect(contact.company_id).toBe('55')
    expect(contact.owner_id).toBe('7')
    expect(contact.created_at).toBe('2024-01-01T00:00:00Z')
    expect(contact.updated_at).toBe('2024-06-01T00:00:00Z')
    expect(contact.metadata).toBe(raw)
  })

  it('handles null AccountId and OwnerId', () => {
    const raw = { Id: 1, Name: 'Test', AccountId: null, OwnerId: null }
    const contact = transformContact(raw)
    expect(contact.company_id).toBeUndefined()
    expect(contact.owner_id).toBeUndefined()
    expect(contact.metadata).toBe(raw)
  })

  it('untransforms Contact to Ploomes payload', () => {
    const out = untransformContact({
      name: 'Ana Costa',
      email: 'ana@test.com',
      company_id: '10',
    })
    expect(out['Name']).toBe('Ana Costa')
    expect(out['Email']).toBe('ana@test.com')
    expect(out['AccountId']).toBe(10)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      Id: 123,
      Name: 'Carlos Silva',
      Email: 'carlos@exemplo.com',
      Phone: '+5511987654321',
      AccountId: 55,
      OwnerId: 7,
      CreateDate: '2024-01-01T00:00:00Z',
      LastUpdateDate: '2024-06-01T00:00:00Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
