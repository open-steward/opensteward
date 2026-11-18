import { describe, it, expect } from 'vitest'
import { transformCompany } from '../../../../../../../src/verticals/crm/adapters/wix-crm/transform/company'

describe('wix-crm transformCompany', () => {
  it('throws because not implemented', () => {
    expect(() => transformCompany({} as never)).toThrow('not implemented')
  })
})
