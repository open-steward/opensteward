import { describe, it, expect } from 'vitest'
import { transformSupplier } from '../../../../../../../src/verticals/inventory/adapters/acctivate/transform/supplier'

describe('transformSupplier', () => {
  it('throws with the expected message', () => {
    expect(() => transformSupplier({})).toThrow(
      'acctivate: suppliers are not available via the web-service API',
    )
  })
})
