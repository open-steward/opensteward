import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompanyDetail } from '../../../../../../../src/verticals/crm/adapters/cobra-crm/transform/company-detail'

/** A `CompanyForDetailedDto`, fields as declared at https://apis.cobra-hilfe.de/api-7858725.md. */
const COMPANY = {
  id: '65d3151fd6a8b43e0c7a2c02',
  name: 'Muster GmbH',
  companyNameShort: 'Muster',
  website: 'https://muster.example',
  tags: [{ id: '123456789012345678901234', text: 'SomeTag' }],
  industrySector: { id: 'ind1', text: 'Manufacturing' },
  phoneNumbers: [
    { id: 'p1', isFavorite: false, type: 'Fax', number: '+4930999999' },
    { id: 'p2', isFavorite: true, type: 'Phone', number: '+4930222222' },
  ],
  created: { date: '2024-02-19T08:57:43.041Z', userId: 'c0316f28-4d2d-4c79-b5fc-bd25f2bca40c' },
  modified: { date: '2024-03-01T10:00:00Z', userId: 'c0316f28-4d2d-4c79-b5fc-bd25f2bca40c' },
}

describe('cobra-crm transformCompanyDetail', () => {
  it('maps a documented company onto a schema-valid Company', () => {
    const c = CompanySchema.parse(transformCompanyDetail(COMPANY))
    expect(c).toMatchObject({
      id: '65d3151fd6a8b43e0c7a2c02',
      name: 'Muster GmbH',
      phone: '+4930222222',
      industry: 'Manufacturing',
      tags: ['SomeTag'],
      created_at: '2024-02-19T08:57:43.041Z',
      updated_at: '2024-03-01T10:00:00Z',
    })
    // `website` is a URL, not the canonical bare domain.
    expect(c.domain).toBeUndefined()
    expect(c.metadata).toEqual(COMPANY)
  })

  it('refuses a company without an id or a name instead of inventing one', () => {
    expect(() => transformCompanyDetail({ ...COMPANY, id: null })).toThrow(/no id/)
    expect(() => transformCompanyDetail({ ...COMPANY, name: null })).toThrow(/no name/)
  })
})
