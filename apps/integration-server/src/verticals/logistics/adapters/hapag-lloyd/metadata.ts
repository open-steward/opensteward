export const metadata = {
  platform: 'hapag-lloyd',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Hapag-Lloyd is a single ocean carrier with no API to list carriers; the carrier concept does not apply to this platform.',
    },
    {
      resource: 'label',
      reason:
        'Ocean carriers do not issue parcel shipping labels; Hapag-Lloyd issues Bills of Lading via EDI, not via a REST label API.',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest management REST API exists; customs and cargo manifest data is exchanged via EDI.',
    },
    {
      resource: 'order',
      reason:
        'No order management REST API exists; freight booking is handled via EDI or the Hapag-Lloyd web portal, not a REST orders endpoint.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: A Quick Quotes/Quotation API is confirmed to exist on the Hapag-Lloyd API portal, but its actual endpoint paths and response fields are behind an authenticated portal and could not be verified from public documentation.',
    },
    {
      resource: 'warehouse',
      reason:
        'Hapag-Lloyd is an ocean carrier, not a 3PL; no warehouse management concept or API exists.',
    },
  ],
} as const
