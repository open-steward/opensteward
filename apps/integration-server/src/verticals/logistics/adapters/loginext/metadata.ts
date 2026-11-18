export const metadata = {
  platform: 'loginext',
  totalResources: 8,
  availableResources: ['shipment', 'order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: API docs portal (developers.loginextsolutions.com) inaccessible; no public GET carrier listing endpoint confirmed',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: only ClientApp/v1/branch/create (POST) publicly confirmed; GET list endpoint not publicly documented',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: ClickPost references a label generation API but no GET endpoint with documented response fields is publicly accessible',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: ClickPost references a manifestation API but no GET endpoint with documented response fields is publicly accessible',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: no rate-quoting API endpoint found in any publicly accessible LogiNext documentation',
    },
    {
      resource: 'trackingevent',
      reason:
        'It documents no event history, and recommends "using webhooks instead of polling GET APIs to get real time event updates".',
    },
  ],
} as const
