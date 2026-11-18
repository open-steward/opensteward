import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawRespondIoCompany,
} from '../../../../../../../src/verticals/crm/adapters/respond-io/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

describe('respond-io transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany({ id: 77 }).id).toBe('77')
  })

  it('maps name', () => {
    expect(transformCompany({ id: '1', name: 'Acme' }).name).toBe('Acme')
  })

  it('falls back to empty string when name is absent', () => {
    expect(transformCompany({ id: '1' }).name).toBe('')
  })

  it('preserves raw metadata', () => {
    const raw: RawRespondIoCompany = { id: '5', name: 'Corp' }
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawRespondIoCompany = { id: '10', name: 'Test Corp' }
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('respond-io untransformCompany', () => {
  it('maps name', () => {
    expect(untransformCompany({ name: 'Acme' })).toMatchObject({ name: 'Acme' })
  })

  it('omits undefined name', () => {
    expect(untransformCompany({})).not.toHaveProperty('name')
  })
})
