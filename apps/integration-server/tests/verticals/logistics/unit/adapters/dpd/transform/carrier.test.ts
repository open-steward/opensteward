/**
 * DPD UK is itself the only carrier, so its carrier row is a static
 * self-descriptor built without a request.
 *
 * The one endpoint that looked like a carrier list, GET
 * https://api.dpd.co.uk/shipping/network/, is a lane lookup: probed live on
 * 2026-09-24 without parameters it answers
 * {"error":{"errorCode":"1007","errorType":"Validation","errorMessage":"Missing mandatory field","obj":"collectionDetails.address.postcode"},"data":null}.
 * Services for a lane are not a carrier catalogue, so the row lists none.
 */
import { describe, it, expect } from 'vitest'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import { transformSelfCarrier } from '../../../../../../../src/verticals/logistics/adapters/dpd/transform/carrier'

describe('transformSelfCarrier (DPD)', () => {
  it('parses against the canonical CarrierSchema', () => {
    const row = CarrierSchema.parse(transformSelfCarrier())
    expect(row).toEqual({ id: 'dpd', name: 'DPD', code: 'dpd' })
  })

  it('claims no services, tracking URL or active flag it cannot source', () => {
    const row = transformSelfCarrier()
    expect(row.services).toBeUndefined()
    expect(row.trackingUrlTemplate).toBeUndefined()
    expect(row.isActive).toBeUndefined()
  })
})
