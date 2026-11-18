export const metadata = {
  platform: 'leopards',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Leopards Courier is itself the sole carrier; the official API has no /carriers endpoint' },
    { resource: 'manifest', reason: 'No manifest endpoint exists in the official Leopards API (only bookPacket, trackBookedPacket, cancelBookedPackets, getAllCities)' },
    { resource: 'order', reason: 'No order management endpoint; Leopards is a pure shipment-booking API — orders are created directly as shipments via bookPacket' },
    {
      resource: 'rate',
      reason:
        'No rate/quote endpoint: the developifynet/leopardscod-php community wrapper, which ' +
        'targets the same merchantapistaging.leopardscourier.com base this adapter uses, only ' +
        'calls getAllCities/bookPacket/trackBookedPacket. getRates was removed from index.ts to match.',
    },
    { resource: 'warehouse', reason: 'No warehouse endpoint exists in the official Leopards API' },
  ],
} as const
