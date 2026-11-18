export const metadata = {
  platform: 'gojek-send',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate', 'carrier', 'label'],
  unavailableResources: [
    { resource: 'manifest', reason: 'GoSend is an on-demand courier service with no manifest concept or endpoint' },
    { resource: 'warehouse', reason: 'GoSend is an on-demand courier service with no warehouse concept or endpoint' },
    { resource: 'order', reason: 'UNVERIFIED: GoSend booking/order list endpoint not confirmed from public docs; API is NDA-gated and full reference is not publicly accessible' },
  ],
} as const
