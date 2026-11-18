/**
 * Fixture fields are Company.v2.yaml's:
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Company.v2.yaml
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawMoskitCompany,
} from '../../../../../../../src/verticals/crm/adapters/moskit/transform/company'

function documented(): RawMoskitCompany {
  return {
    id: 20,
    createdBy: { id: 7 },
    responsible: { id: 8 },
    dateCreated: '2020-07-08T18:18:50.000+00:00',
    name: 'Acme Ltda',
    cnpj: '00.000.000/0001-00',
    domain: 'acme.example',
    primaryPhone: { id: 52 },
    phones: [
      { id: 51, number: '+55 11 3000-0001' },
      { id: 52, number: '+55 11 3000-0002' },
    ],
    source: 'MOSKIT_API_V2',
  }
}

describe('moskit transformCompany', () => {
  it('maps the documented fields and satisfies the schema', () => {
    const out = CompanySchema.parse(transformCompany(documented()))
    expect(out).toMatchObject({
      id: '20',
      name: 'Acme Ltda',
      domain: 'acme.example',
      phone: '+55 11 3000-0002',
      owner_id: '8',
      created_at: '2020-07-08T18:18:50.000Z',
    })
  })

  it('parses a record with only the id', () => {
    const out = CompanySchema.parse(transformCompany({ id: 3 }))
    expect(out.id).toBe('3')
    expect(out.phone).toBeUndefined()
  })

  it('keeps the raw payload as metadata', () => {
    const raw = documented()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Acme', phone: '+1234' })
    expect(result.name).toBe('Acme')
    expect(result.phone).toBe('+1234')
  })
})
