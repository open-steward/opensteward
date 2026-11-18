export const metadata = {
  platform: 'manhattan-wms',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'warehouse'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Manhattan Active WMS delegates carrier management to external parcel provider integrations (MetaPack, FedEx, UPS, etc.); the full REST API reference for /carriers endpoints is behind an OAuth-authenticated developer portal (api.developer.manh.com) and cannot be confirmed without credentials.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Label generation in Manhattan Active WMS is handled via parcel carrier integrations (rate shop → ship → print flow); no public /labels REST endpoint path or response schema is documented in accessible docs — full API reference requires developer portal login.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Parcel manifesting (End of Day) in Manhattan Active WMS is managed through carrier integrations; no /manifests REST endpoint path or response schema is documented in accessible public docs — full API reference requires developer portal login.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: Rate shopping in Manhattan Active WMS is performed internally at package generation via carrier integrations; no /rates REST endpoint path or response schema is documented in accessible public docs — full API reference requires developer portal login.',
    },
    {
      resource: 'trackingevent',
      reason:
        'UNVERIFIED: Tracking number generation in Manhattan Active WMS is handled by the parcel carrier integration layer; no /tracking-events REST endpoint path or response schema is documented in accessible public docs — full API reference requires developer portal login.',
    },
  ],
} as const
