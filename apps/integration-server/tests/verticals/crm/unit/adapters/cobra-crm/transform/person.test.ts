import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformPeopleListItem,
  transformPerson,
} from '../../../../../../../src/verticals/crm/adapters/cobra-crm/transform/person'

/** A `PeopleList` row, fields as declared at https://apis.cobra-hilfe.de/api-7858747.md. */
const LIST_ROW = {
  id: '65d3151fd6a8b43e0c7a1b01',
  firstname: 'Erika',
  lastname: 'Mustermann',
  businessName: 'Muster GmbH',
  position: 'Head of Sales',
  lifecycleText: 'Customer',
  lifecycleColor: '#00ff00',
  email: 'erika@muster.example',
  profileImage: null,
  managedBy: null,
  initials: 'EM',
  tableImagePath: null,
  name: 'Mustermann, Erika',
}

/** A `PeopleWithResponsibleForObjects`, fields as declared at https://apis.cobra-hilfe.de/api-7858749.md. */
const DETAIL = {
  id: '65d3151fd6a8b43e0c7a1b01',
  salutation: 'Frau',
  title: 'Dr.',
  firstname: 'Erika',
  lastname: 'Mustermann',
  name: 'Mustermann, Erika',
  tags: [{ id: '123456789012345678901234', text: 'SomeTag' }],
  lifecycle: {
    lifecycleId: 'lc1',
    text: 'Customer',
    color: '#00ff00',
    dateChanged: '2024-02-19T08:57:43.041Z',
  },
  created: {
    firstName: 'John',
    lastName: 'Doe',
    date: '2024-02-19T08:57:43.041Z',
    userId: 'c0316f28-4d2d-4c79-b5fc-bd25f2bca40c',
  },
  modified: {
    firstName: 'John',
    lastName: 'Doe',
    date: '2024-03-01T10:00:00Z',
    userId: 'c0316f28-4d2d-4c79-b5fc-bd25f2bca40c',
  },
  cards: [
    {
      id: 'card-private',
      isPrivate: true,
      isFavorite: false,
      companyId: null,
      emails: [
        { isFavorite: true, mail: 'erika@home.example', type: { id: 't1', text: 'private' } },
      ],
      phones: [{ isFavorite: true, type: 'Phone', number: '+4930111111' }],
      businessPositions: [],
    },
    {
      id: 'card-business',
      isPrivate: false,
      isFavorite: true,
      companyId: '65d3151fd6a8b43e0c7a2c02',
      business: 'Muster GmbH',
      emails: [
        { isFavorite: false, mail: 'info@muster.example', type: { id: 't2', text: 'business' } },
        { isFavorite: true, mail: 'erika@muster.example', type: { id: 't2', text: 'business' } },
      ],
      phones: [
        { isFavorite: false, type: 'Phone (business)', number: '+491701234567' },
        { isFavorite: true, type: 'Phone (business)', number: '+4930222222' },
      ],
      businessPositions: [
        { department: 'Sales', position: 'Head of Sales', isFavorite: true },
        { department: 'Board', position: 'Advisor', isFavorite: false },
      ],
    },
  ],
}

describe('cobra-crm transformPeopleListItem', () => {
  it('maps a documented PeopleList row onto a schema-valid Contact', () => {
    const c = ContactSchema.parse(transformPeopleListItem(LIST_ROW))
    expect(c).toMatchObject({
      id: '65d3151fd6a8b43e0c7a1b01',
      first_name: 'Erika',
      last_name: 'Mustermann',
      name: 'Mustermann, Erika',
      email: 'erika@muster.example',
      title: 'Head of Sales',
      stage: 'Customer',
    })
    expect(c.metadata).toEqual(LIST_ROW)
  })

  it('leaves null fields unset and refuses a row without an id', () => {
    const c = ContactSchema.parse(
      transformPeopleListItem({ id: 'x1', firstname: null, email: null }),
    )
    expect(c.first_name).toBeUndefined()
    expect(c.email).toBeUndefined()
    expect(() => transformPeopleListItem({ id: null })).toThrow(/no id/)
  })
})

describe('cobra-crm transformPerson', () => {
  it('maps a documented person onto a schema-valid Contact from the favorite business card', () => {
    const c = ContactSchema.parse(transformPerson(DETAIL))
    expect(c).toMatchObject({
      id: '65d3151fd6a8b43e0c7a1b01',
      first_name: 'Erika',
      last_name: 'Mustermann',
      name: 'Mustermann, Erika',
      email: 'erika@muster.example',
      phone: '+4930222222',
      title: 'Head of Sales',
      company_id: '65d3151fd6a8b43e0c7a2c02',
      stage: 'Customer',
      tags: ['SomeTag'],
      created_at: '2024-02-19T08:57:43.041Z',
      updated_at: '2024-03-01T10:00:00Z',
    })
    // The academic `title` (Dr.) is not a job title.
    expect(c.title).not.toBe('Dr.')
    expect(c.metadata).toEqual(DETAIL)
  })

  it('reads no card fields when no card is the favorite', () => {
    const c = ContactSchema.parse(
      transformPerson({
        ...DETAIL,
        cards: DETAIL.cards.map((card) => ({ ...card, isFavorite: false })),
      }),
    )
    expect(c.email).toBeUndefined()
    expect(c.phone).toBeUndefined()
    expect(c.company_id).toBeUndefined()
    expect(c.title).toBeUndefined()
  })

  it('refuses a person without an id', () => {
    expect(() => transformPerson({ ...DETAIL, id: null })).toThrow(/no id/)
  })
})
