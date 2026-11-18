import type { Carrier } from '../../../schema/carrier'

/**
 * DPD UK is itself the only carrier, so its carrier row is a static
 * self-descriptor: DPD's identity, built without a request.
 *
 * DPD's GET https://api.dpd.co.uk/shipping/network/ is not a carrier list. It
 * answers the services available for one collection/delivery lane and refuses
 * a call without one (live probe, 2026-09-24):
 * {"error":{"errorCode":"1007","errorType":"Validation","errorMessage":"Missing mandatory field","obj":"collectionDetails.address.postcode"},"data":null}
 * so the row lists no services. No tracking URL or active flag is claimed:
 * neither has a documented source (the API docs are partner-gated).
 */
export function transformSelfCarrier(): Carrier {
  return { id: 'dpd', name: 'DPD', code: 'dpd' }
}
