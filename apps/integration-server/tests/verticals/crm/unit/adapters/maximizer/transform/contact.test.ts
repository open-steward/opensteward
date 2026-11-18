import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/maximizer/transform/contact'
import { documentedContact } from '../fixtures/documented'

describe('maximizer transformContact (Octopus AbEntry, Type Contact)', () => {
  it('maps the documented AbEntry fields and parses as a Contact', () => {
    const out = ContactSchema.parse(transformContact(documentedContact()))
    expect(out).toMatchObject({
      id: 'Q29udGFjdAkyMjA1MDUyNTIyMjczODY2NDAwMjlDCTE=',
      first_name: 'Marty',
      last_name: 'McFly',
      name: 'Marty McFly',
      email: 'escona@maximizer.com',
      phone: '123-456-7890',
      company_id: 'Q29tcGFueQkyNTEwMjQyNTEwNTQ0OTU5NTAwMDFDCTA=',
      address: { line1: '1234 Main St.', city: 'Anytown', region: 'BC', postalCode: '12345' },
      created_at: '2015-01-20T20:37:51.000Z',
    })
  })

  it('drops a free-text Country that is not an ISO 3166 alpha-2 code', () => {
    const out = transformContact(documentedContact())
    expect(out.address?.country).toBeUndefined()
  })

  it('links company_id only when the Parent is a Company, not an Individual', () => {
    const raw = { ...documentedContact(), Parent: { Key: 'SW5kaXZpZHVhbA==', Type: 'Individual' } }
    expect(transformContact(raw).company_id).toBeUndefined()
  })

  it('leaves a date without a zone out rather than guessing one', () => {
    const raw = { ...documentedContact(), CreationDate: '2018-04-20T11:12:13' }
    expect(transformContact(raw).created_at).toBeUndefined()
  })

  it('maps Position to title', () => {
    const raw = { ...documentedContact(), Position: 'Manager' }
    expect(ContactSchema.parse(transformContact(raw)).title).toBe('Manager')
  })

  it('leaves out an Email that is not an email address', () => {
    const raw = { ...documentedContact(), Email: 'not an email' }
    expect(transformContact(raw).email).toBeUndefined()
  })

  it('throws on a row with no Key', () => {
    expect(() => transformContact({ ...documentedContact(), Key: '' })).toThrow(/no Key/)
  })

  it('keeps the raw row as metadata', () => {
    const raw = documentedContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('untransform is unchanged (write path, out of scope)', () => {
    expect(untransformContact({ first_name: 'A' })).toEqual({ FirstName: 'A' })
  })
})
