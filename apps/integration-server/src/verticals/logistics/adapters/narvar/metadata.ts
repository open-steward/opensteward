export const metadata = {
  platform: 'narvar',
  totalResources: 8,
  availableResources: ['trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Narvar does not expose a carrier management API; carriers are configured internally via the Narvar Hub dashboard and cannot be listed or retrieved programmatically.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: A Returns Label API exists at ws.narvar.com with HTTP Basic Auth, but this is a separate API surface with different authentication and base URL from the api.narvar.com Bearer-token adapter already implemented; cannot be safely unified without confirmed credential compatibility.',
    },
    {
      resource: 'manifest',
      reason:
        'Narvar has no manifest concept or endpoint; it is a post-purchase notification platform and does not support carrier manifest submission.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: Narvar Order API is documented as a push-only (POST) endpoint for sending orders to Narvar for tracking notifications; no publicly documented GET list or retrieve endpoint was found, but full docs are behind a login wall.',
    },
    {
      resource: 'rate',
      reason:
        'Narvar has no rate-shopping functionality; it is a post-purchase experience platform and does not provide shipping rate quotes.',
    },
    {
      resource: 'shipment',
      reason:
        'Narvar exposes no GET shipment endpoints; shipment data is nested inside the Order push payload which is POST-only (outbound to Narvar).',
    },
    {
      resource: 'warehouse',
      reason:
        'Narvar has no fulfillment warehouse concept; return locations (/api/return_locations) represent public drop-off points for returns, not warehouse/fulfillment centres.',
    },
  ],
} as const
