export const metadata = {
  platform: 'cigo-tracker',
  totalResources: 8,
  availableResources: ['order', 'shipment'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'CIGO Tracker is an owned-fleet last-mile dispatch platform; it manages internal drivers/operators, not third-party carrier integrations. No carriers API endpoint exists.',
    },
    {
      resource: 'label',
      reason:
        'CIGO Tracker does not generate shipping labels. Jobs carry a tracking_url for customer-facing tracking, but no label PDF/ZPL generation endpoint exists.',
    },
    {
      resource: 'manifest',
      reason:
        'CIGO Tracker has no manifest (end-of-day scan sheet) concept or API endpoint. Delivery batching is handled via Itineraries, which are not equivalent to carrier manifests.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: CIGO Tracker is not a rate-shopping platform. All public docs confirm only Jobs/Actions/Itineraries as API resources. Full API reference is behind authentication and could not be confirmed, but rate endpoints are architecturally absent from this owned-fleet dispatch product.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Depots/warehouses are referenced in the UI but no /depots or /warehouses endpoint is documented publicly. The full API reference is behind authentication and could not be confirmed.',
    },
    {
      resource: 'trackingevent',
      reason:
        'GET /jobs/id/{jobID} returns the current job "status" only, and GET /geofencing/job_id/{job_id} gives "arrival" and "departure" as times of day ("08:00:00 AM") with no date.',
    },
  ],
} as const
