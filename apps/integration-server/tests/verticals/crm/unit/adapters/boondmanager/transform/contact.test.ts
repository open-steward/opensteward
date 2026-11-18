import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawBoondManagerContact,
} from '../../../../../../../src/verticals/crm/adapters/boondmanager/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(
  attribs: Partial<RawBoondManagerContact['attributes']> = {},
  rels: RawBoondManagerContact['relationships'] = {},
): RawBoondManagerContact {
  return {
    id: 'cont-1',
    type: 'contact',
    attributes: { ...attribs },
    relationships: rels,
  }
}

describe('boondmanager transformContact', () => {
  it('maps id to string', () => {
    const raw: RawBoondManagerContact = {
      id: '99',
      type: 'contact',
      attributes: {},
    }
    expect(transformContact(raw).id).toBe('99')
  })

  it('maps firstName to first_name and lastName to last_name', () => {
    const result = transformContact(makeRaw({ firstName: 'Marie', lastName: 'Dupont' }))
    expect(result.first_name).toBe('Marie')
    expect(result.last_name).toBe('Dupont')
  })

  it('computes full name from first + last', () => {
    const result = transformContact(makeRaw({ firstName: 'Marie', lastName: 'Dupont' }))
    expect(result.name).toBe('Marie Dupont')
  })

  it('returns undefined name when both absent', () => {
    expect(transformContact(makeRaw()).name).toBeUndefined()
  })

  it('maps email1 to email', () => {
    expect(transformContact(makeRaw({ email1: 'marie@example.fr' })).email).toBe('marie@example.fr')
  })

  it('maps phone1 to phone', () => {
    expect(transformContact(makeRaw({ phone1: '+33123456789' })).phone).toBe('+33123456789')
  })

  it('maps title', () => {
    expect(transformContact(makeRaw({ title: 'CEO' })).title).toBe('CEO')
  })

  it('maps company relationship to company_id', () => {
    const result = transformContact(
      makeRaw({}, { company: { data: { id: 'co-55', type: 'company' } } }),
    )
    expect(result.company_id).toBe('co-55')
  })

  it('maps mainManager relationship to owner_id', () => {
    const result = transformContact(
      makeRaw({}, { mainManager: { data: { id: 'u-7', type: 'staff' } } }),
    )
    expect(result.owner_id).toBe('u-7')
  })

  it('converts creationDate to created_at', () => {
    const result = transformContact(makeRaw({ creationDate: '2026-01-15T09:30:00Z' }))
    expect(result.created_at).toMatch(/2026-01-15/)
  })

  it('converts updateDate to updated_at', () => {
    const result = transformContact(makeRaw({ updateDate: '2026-02-01T14:20:00Z' }))
    expect(result.updated_at).toMatch(/2026-02-01/)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const raw = makeRaw(
      {
        firstName: 'Marie',
        lastName: 'Dupont',
        email1: 'marie.dupont@example.fr',
        phone1: '+33123456789',
        title: 'CEO',
        creationDate: '2026-01-15T09:30:00Z',
        updateDate: '2026-02-01T14:20:00Z',
      },
      {
        company: { data: { id: 'co-55', type: 'company' } },
        mainManager: { data: { id: 'u-7', type: 'staff' } },
      },
    )
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('boondmanager untransformContact', () => {
  it('maps first_name back to firstName', () => {
    expect(untransformContact({ first_name: 'Marie' })['firstName']).toBe('Marie')
  })

  it('maps last_name back to lastName', () => {
    expect(untransformContact({ last_name: 'Dupont' })['lastName']).toBe('Dupont')
  })

  it('maps email back to email1', () => {
    expect(untransformContact({ email: 'marie@example.fr' })['email1']).toBe('marie@example.fr')
  })

  it('maps phone back to phone1', () => {
    expect(untransformContact({ phone: '+33123456789' })['phone1']).toBe('+33123456789')
  })

  it('maps title back', () => {
    expect(untransformContact({ title: 'CEO' })['title']).toBe('CEO')
  })

  it('round-trips first_name, last_name, email', () => {
    const raw = makeRaw({
      firstName: 'Alice',
      lastName: 'Martin',
      email1: 'alice@example.fr',
    })
    const canonical = transformContact(raw)
    const back = untransformContact(canonical)
    expect(back['firstName']).toBe('Alice')
    expect(back['lastName']).toBe('Martin')
    expect(back['email1']).toBe('alice@example.fr')
  })
})
