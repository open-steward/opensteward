export const metadata = {
  platform: 'veracore',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: VeraCore Public REST API Swagger is domain-specific and behind authentication; no /carriers list endpoint appears in any public documentation, integration guides, or the official Python client. CarrierCode is available as a field on shipments only.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: No dedicated /labels endpoint found in any public VeraCore REST API documentation. Label URLs are surfaced as a field on shipments (LabelUrl). Label generation in the VeraCore ecosystem is handled by third-party tools such as ShipWise, not by the native Public.Api.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: No /manifests endpoint found in any public VeraCore REST API documentation. Manifesting is explicitly handled by third-party integration partners (e.g. ShipWise), not the native Public.Api.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: No /rates or rate-shopping endpoint found in any public VeraCore REST API documentation. Rate shopping is explicitly performed by third-party tools (e.g. ShipWise) which pull orders from VeraCore and compute rates independently.',
    },
  ],
} as const
