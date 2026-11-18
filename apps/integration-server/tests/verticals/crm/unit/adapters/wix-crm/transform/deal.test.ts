import { describe, it, expect } from 'vitest'
import { transformDeal } from '../../../../../../../src/verticals/crm/adapters/wix-crm/transform/deal'

describe('wix-crm transformDeal', () => {
  it('throws because not implemented', () => {
    expect(() => transformDeal({} as never)).toThrow('not implemented')
  })
})
