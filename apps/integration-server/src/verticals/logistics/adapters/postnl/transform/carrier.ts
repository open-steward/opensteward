import type { Carrier } from '../../../schema/carrier'

/**
 * PostNL carrier transform.
 *
 * PostNL's API has no carrier-listing endpoint — PostNL itself is the single
 * carrier. The canonical carrier record is derived from the platform identity
 * and the product codes documented in the PostNL Developer Portal and the
 * official PostNL rate sheets (postnl.nl/en/rates/).
 *
 * Selected product codes (ProductCodeDelivery) from the PostNL documentation:
 *   3085 — Standard shipment (domestic, no signature)
 *   3089 — Standard shipment with signature
 *   3096 — Standard shipment with signature + insurance
 *   3533 — Parcel to mailbox (brievenbusPakje)
 *   3534 — Parcel to mailbox with track & trace
 *   4945 — International packet (to EU)
 *   4947 — International tracked packet
 */

export const POSTNL_CARRIER: Carrier = {
  id: 'postnl',
  name: 'PostNL',
  code: 'postnl',
  trackingUrlTemplate: 'https://tracking.postnl.nl/?B={trackingNumber}',
  isActive: true,
  services: [
    { code: '3085', name: 'Standard Shipment' },
    { code: '3089', name: 'Standard Shipment + Signature' },
    { code: '3096', name: 'Standard Shipment + Signature + Insurance' },
    { code: '3533', name: 'Parcel to Mailbox (Brievenbuspacket)' },
    { code: '3534', name: 'Parcel to Mailbox + Track & Trace' },
    { code: '4945', name: 'International Packet (EU)' },
    { code: '4947', name: 'International Tracked Packet' },
  ],
}

/** Returns the static PostNL carrier record. */
export function transformCarrier(): Carrier {
  return POSTNL_CARRIER
}
