export const metadata = {
  platform: 'cas-genesisworld',
  totalResources: 6,
  availableResources: ['activity', 'company', 'contact', 'note'],
  unavailableResources: [
    {
      resource: 'deal',
      reason:
        'UNVERIFIED: CAS genesisWorld REST API v7 Swagger spec requires an authenticated instance to inspect; publicly accessible docs (ReDoc shell at demo.cas.de) returned no endpoint listings. Prior adapter author comment states no native deal/opportunity object exists in the standard REST API v7.',
    },
    {
      resource: 'pipeline',
      reason:
        'UNVERIFIED: CAS genesisWorld REST API v7 Swagger spec requires an authenticated instance to inspect; publicly accessible docs (ReDoc shell at demo.cas.de) returned no endpoint listings. Prior adapter author comment states no pipeline concept exists in the standard REST API v7.',
    },
  ],
} as const
