export const metadata = {
  platform: 'roambee',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Roambee is a supply chain visibility/monitoring platform, not a carrier management system; no carrier concept or endpoint exists in its API' },
    { resource: 'label', reason: 'Roambee does not generate or manage shipping labels; it is an IoT sensor tracking platform' },
    { resource: 'manifest', reason: 'Roambee has no manifest concept; the platform tracks shipment events and conditions only' },
    { resource: 'order', reason: 'Roambee has no order management functionality; it integrates with ERP/TMS systems but does not expose an orders API' },
    { resource: 'rate', reason: 'Roambee does not quote shipping rates; it is a visibility/monitoring platform, not a shipping rate engine' },
    { resource: 'warehouse', reason: 'UNVERIFIED: Roambee has a warehouse/facility monitoring concept but the API endpoint structure is behind an authenticated portal and not publicly documented' },
  ],
} as const
