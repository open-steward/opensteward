import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawSimplicatePerson,
  type RawSimplicateLinkedOrg,
} from '../../../../../../../src/verticals/crm/adapters/simplicate/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawSimplicatePerson> = {}): RawSimplicatePerson {
  return { id: 'person:aabbccdd11223344', ...overrides }
}

describe('simplicate transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 'person:abc' })).id).toBe('person:abc')
  })

  it('maps first_name and family_name to first_name / last_name', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', family_name: 'Doe' }))
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('builds full name from first_name + family_name', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', family_name: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('returns undefined name when neither name field present', () => {
    expect(transformContact(makeRaw()).name).toBeUndefined()
  })

  it('maps email', () => {
    expect(transformContact(makeRaw({ email: 'jane@example.com' })).email).toBe('jane@example.com')
  })

  it('prefers work_phone from linked org over person-level phone', () => {
    const linked: RawSimplicateLinkedOrg = {
      organization_id: 'organization:org1',
      work_phone: '+1555-work',
    }
    const result = transformContact(
      makeRaw({ phone: '+1555-personal', linked_as_contact_to_organization: [linked] }),
    )
    expect(result.phone).toBe('+1555-work')
  })

  it('falls back to person-level work_phone then phone when org link absent', () => {
    expect(transformContact(makeRaw({ phone: '+1555-personal' })).phone).toBe('+1555-personal')
  })

  it('maps work_mobile from linked org to mobile', () => {
    const linked: RawSimplicateLinkedOrg = {
      organization_id: 'organization:org1',
      work_mobile: '+1555-mobile',
    }
    const result = transformContact(makeRaw({ linked_as_contact_to_organization: [linked] }))
    expect(result.mobile).toBe('+1555-mobile')
  })

  it('maps organization_id from first linked org to company_id', () => {
    const linked: RawSimplicateLinkedOrg = { organization_id: 'organization:org99' }
    const result = transformContact(makeRaw({ linked_as_contact_to_organization: [linked] }))
    expect(result.company_id).toBe('organization:org99')
  })

  it('maps created_at and updated_at as-is', () => {
    const result = transformContact(
      makeRaw({
        created_at: '2024-01-01T00:00:00+00:00',
        updated_at: '2024-06-01T00:00:00+00:00',
      }),
    )
    expect(result.created_at).toBe('2024-01-01T00:00:00+00:00')
    expect(result.updated_at).toBe('2024-06-01T00:00:00+00:00')
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ first_name: 'Alice' })
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSimplicatePerson = {
      id: 'person:aabbccdd',
      first_name: 'Jane',
      family_name: 'Doe',
      email: 'jane@example.com',
      phone: '+15550001111',
      created_at: '2024-01-01T00:00:00+00:00',
      updated_at: '2024-06-01T00:00:00+00:00',
    }
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('simplicate untransformContact', () => {
  it('maps first_name', () => {
    expect(untransformContact({ first_name: 'Alice' })).toMatchObject({ first_name: 'Alice' })
  })

  it('maps last_name to family_name', () => {
    expect(untransformContact({ last_name: 'Jones' })).toMatchObject({ family_name: 'Jones' })
  })

  it('maps email', () => {
    expect(untransformContact({ email: 'a@example.com' })).toMatchObject({ email: 'a@example.com' })
  })

  it('omits unset fields', () => {
    expect(Object.keys(untransformContact({}))).toHaveLength(0)
  })
})
