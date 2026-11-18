import { describe, it, expect } from 'vitest'
import { transformCompany } from '../../../../../../../src/verticals/crm/adapters/streak/transform/company'

describe('streak transformCompany', () => {
  it('throws because Streak does not support a dedicated company resource', () => {
    expect(() => transformCompany({})).toThrow('Streak does not support')
  })
})
