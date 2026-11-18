import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { requireString } from '../../../../../../../src/verticals/crm/adapters/espocrm/transform/required'

describe('espocrm requireString', () => {
  it('returns a present string, which fills a required canonical id', () => {
    const id = requireString('5564', 'Account.id')
    expect(CompanySchema.parse({ id, name: 'Acme', metadata: {} }).id).toBe('5564')
  })

  it.each([undefined, null, '', 42])('throws on %s instead of inventing a value', (v) => {
    expect(() => requireString(v, 'Account.id')).toThrow('EspoCRM Account.id is missing')
  })
})
