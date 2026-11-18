export const metadata = {
  platform: 'japan-post',
  totalResources: 8,
  availableResources: ['trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Japan Post public REST API is limited to parcel tracking; no carrier-listing endpoint exists in the publicly documented API surface.',
    },
    {
      resource: 'label',
      reason:
        'Japan Post public REST API is limited to parcel tracking; label generation requires the contracted WMS Web API (specs in a non-public PDF) or a third-party intermediary.',
    },
    {
      resource: 'manifest',
      reason:
        'Japan Post public REST API is limited to parcel tracking; manifest management is not part of the publicly documented API surface.',
    },
    {
      resource: 'order',
      reason:
        'Japan Post public REST API is limited to parcel tracking; order management is not part of the publicly documented API surface.',
    },
    {
      resource: 'rate',
      reason:
        'Japan Post public REST API is limited to parcel tracking; rate quoting is not part of the publicly documented API surface.',
    },
    {
      resource: 'shipment',
      reason:
        'Japan Post public REST API is limited to parcel tracking; shipment creation/retrieval is not part of the publicly documented API surface.',
    },
    {
      resource: 'warehouse',
      reason:
        'Japan Post public REST API is limited to parcel tracking; warehouse management is not part of the publicly documented API surface.',
    },
  ],
} as const
