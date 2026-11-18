import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawMegaplanContractor,
} from '../../../../../../../src/verticals/crm/adapters/megaplan/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

/**
 * A ContractorHuman built from the first-party RAML type (served at
 * https://demo.megaplan.ru/api/v3/) — firstName, middleName, lastName, name,
 * position, company (ContractorCompany|ContractorHuman), responsibles
 * ((ContractorCompany|ContractorHuman|Employee|Group)[]), contactInfo
 * ((Address|ContactInfo)[]), tags (Tag[]: name), timeCreated/timeUpdated
 * (DateTime: value "Дата и время в ISO 8601 формате") — with ContactInfo
 * entries shaped as the first-party SDK's contractor/create.php sends them
 * ({ contentType: 'ContactInfo', isMain: true, type: 'email', value }).
 */
function documented(): RawMegaplanContractor {
  return {
    contentType: 'ContractorHuman',
    id: '1000123',
    firstName: 'Иван',
    middleName: 'Петрович',
    lastName: 'Сидоров',
    name: 'Сидоров Иван Петрович',
    position: 'Директор',
    company: { contentType: 'ContractorCompany', id: '1000003' },
    responsibles: [
      { contentType: 'Group', id: '7' },
      { contentType: 'Employee', id: '1000014' },
    ],
    contactInfo: [
      { contentType: 'Address', id: '55' } as never,
      { contentType: 'ContactInfo', type: 'phone', value: '+7 495 000-00-01', isMain: false },
      { contentType: 'ContactInfo', type: 'email', value: 'other@romashka.example', isMain: false },
      { contentType: 'ContactInfo', type: 'email', value: 'ivan@romashka.example', isMain: true },
      { contentType: 'ContactInfo', type: 'phone', value: '+7 495 000-00-02', isMain: true },
    ],
    tags: [{ contentType: 'Tag', id: '3', name: 'vip' }],
    timeCreated: { contentType: 'DateTime', value: '2024-01-15T09:30:00+03:00' },
    timeUpdated: { contentType: 'DateTime', value: '2024-02-01T14:20:00+03:00' },
  }
}

describe('megaplan transformContact', () => {
  it('parses a documented ContractorHuman with ContactSchema', () => {
    const out = ContactSchema.parse(transformContact(documented()))
    expect(out).toMatchObject({
      id: '1000123',
      first_name: 'Иван',
      last_name: 'Сидоров',
      name: 'Сидоров Иван Петрович',
      title: 'Директор',
      email: 'ivan@romashka.example',
      phone: '+7 495 000-00-02',
      company_id: '1000003',
      owner_id: '1000014',
      tags: ['vip'],
      created_at: '2024-01-15T06:30:00.000Z',
      updated_at: '2024-02-01T11:20:00.000Z',
    })
  })

  it('reads email and phone from contactInfo, preferring isMain', () => {
    const out = transformContact(documented())
    expect(out.email).toBe('ivan@romashka.example')
    expect(out.phone).toBe('+7 495 000-00-02')
  })

  it('falls back to the first contactInfo of a type when none is main', () => {
    const raw = documented()
    raw.contactInfo = [
      { contentType: 'ContactInfo', type: 'email', value: 'a@romashka.example' },
      { contentType: 'ContactInfo', type: 'email', value: 'b@romashka.example' },
    ]
    expect(transformContact(raw).email).toBe('a@romashka.example')
    expect(transformContact(raw).phone).toBeUndefined()
  })

  it('reads email and phone only from ContactInfo entries, never an Address', () => {
    const raw = documented()
    // Guard test: contactInfo is typed (Address|ContactInfo)[]; only a
    // ContactInfo carries a contact value.
    raw.contactInfo = [
      { contentType: 'Address', type: 'email', value: 'x@romashka.example' } as never,
      { contentType: 'ContactInfo', type: 'email', value: 'ivan@romashka.example' },
    ]
    expect(transformContact(raw).email).toBe('ivan@romashka.example')
  })

  it('never invents a mobile: the type has no mobile/work split', () => {
    expect(transformContact(documented()).mobile).toBeUndefined()
  })

  it('maps company only when it is a ContractorCompany', () => {
    const raw = documented()
    raw.company = { contentType: 'ContractorHuman', id: '9' }
    expect(transformContact(raw).company_id).toBeUndefined()
  })

  it('takes owner_id from the first Employee responsible, never a Group', () => {
    const raw = documented()
    raw.responsibles = [{ contentType: 'Group', id: '7' }]
    expect(transformContact(raw).owner_id).toBeUndefined()
  })

  it('reads DateTime.value, not the DateTime object', () => {
    const raw = documented()
    delete raw.timeUpdated
    const out = ContactSchema.parse(transformContact(raw))
    expect(out.updated_at).toBeUndefined()
    expect(out.created_at).toBe('2024-01-15T06:30:00.000Z')
  })

  it('parses a list row with only base fields', () => {
    const out = ContactSchema.parse(
      transformContact({ contentType: 'ContractorHuman', id: '42', firstName: 'Олег' }),
    )
    expect(out.id).toBe('42')
    expect(out.email).toBeUndefined()
    expect(out.tags).toBeUndefined()
  })

  it('throws on a row without an id instead of inventing one', () => {
    expect(() => transformContact({ contentType: 'ContractorHuman' })).toThrow(/no id/)
  })

  it('preserves raw metadata by reference', () => {
    const raw = documented()
    expect(transformContact(raw).metadata).toBe(raw)
  })
})

describe('megaplan untransformContact', () => {
  it('sets contentType to Client', () => {
    expect(untransformContact({}).contentType).toBe('Client')
  })

  it('maps first_name to firstName', () => {
    expect(untransformContact({ first_name: 'Ivan' }).firstName).toBe('Ivan')
  })

  it('maps last_name to lastName', () => {
    expect(untransformContact({ last_name: 'Petrov' }).lastName).toBe('Petrov')
  })

  it('maps email', () => {
    expect(untransformContact({ email: 'ivan@example.com' }).email).toBe('ivan@example.com')
  })

  it('maps phone to phones array with work type', () => {
    const result = untransformContact({ phone: '+74951234567' })
    expect(result.phones).toEqual([{ number: '+74951234567', type: 'work' }])
  })

  it('maps company_id to contractors array', () => {
    const result = untransformContact({ company_id: '20' })
    expect(result.contractors).toEqual([{ contentType: 'Contractor', id: '20' }])
  })

  it('maps owner_id to responsibles array', () => {
    const result = untransformContact({ owner_id: '3' })
    expect(result.responsibles).toEqual([{ contentType: 'Employee', id: '3' }])
  })
})
