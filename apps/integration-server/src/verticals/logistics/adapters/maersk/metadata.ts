export const metadata = {
  platform: 'maersk',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Maersk is itself a single ocean carrier; no carrier-listing endpoint exists in any Maersk API product.',
    },
    {
      resource: 'order',
      reason:
        'No order management endpoint exists in any Maersk API product (Track-and-Trace, Ground Freight, PackageHub, or Offers).',
    },
    {
      resource: 'warehouse',
      reason:
        'No warehouse management endpoint exists in any Maersk API product.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: Maersk MGF Ratings API confirmed at api.maersk.com/mgf/public-gateway/ratings but requires account-specific locationId and tariffCode (CoPilot credentials) not exposed through the standard RateRequestParams interface; response schema is behind authenticated portal.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Maersk MGF Label Creation API confirmed at delivers.maersk.com/developer but the 2023 spec resolves to a SOAP/WSDL endpoint; REST endpoint paths and response field names are not publicly accessible without a CoPilot account.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Maersk PackageHub (docs.packagehub.mec.maersk.com) exposes POST /Manifest and GET /Manifest but uses a separate JWT auth system (POST /Account/Token to visiblescm.com) incompatible with the current adapter\'s OAuth credentials.',
    },
  ],
} as const
