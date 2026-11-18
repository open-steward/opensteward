import { describe, it, expect } from 'vitest'
import { transformNote } from '../../../../../../../src/verticals/crm/adapters/wix-crm/transform/note'

describe('wix-crm transformNote', () => {
  it('throws because not implemented', () => {
    expect(() => transformNote({} as never)).toThrow('not implemented')
  })
})
