import { describe, it, expect } from 'vitest'
import { transformLocation } from '../../../../../../../src/verticals/inventory/adapters/acctivate/transform/location'

describe('transformLocation', () => {
  it('throws with the expected message', () => {
    expect(() => transformLocation({})).toThrow(
      'acctivate: locations are not available via the web-service API',
    )
  })
})
