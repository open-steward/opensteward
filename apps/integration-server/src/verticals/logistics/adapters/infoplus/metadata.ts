export const metadata = {
  platform: 'infoplus',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'shipment', 'warehouse'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'Infoplus has no shipment manifest endpoint. The only manifest-related entity is ManifestPartner (/beta/manifestPartner), which is a lookup reference (id + label for a solution provider) and does not correspond to the canonical Manifest schema.',
    },
    {
      resource: 'rate',
      reason:
        'Infoplus has no real-time rate shopping endpoint. RateCard (/beta/rateCard) is a static pricing configuration record (carrier/weight/zone/effectiveDate), not a shipment rate quote, and does not match the canonical Rate schema.',
    },
    {
      resource: 'label',
      reason:
        'The v2.0 API reference defines no label resource, and its parcelShipment definition has no label URL or label document field',
    },
    {
      resource: 'trackingevent',
      reason:
        'The v2.0 API reference defines no tracking or parcel-activity resource (parcelShipmentActivity is not in its swagger); a parcelShipment carries only its current trackingNo, shipped and deliveredDate',
    },
  ],
} as const
