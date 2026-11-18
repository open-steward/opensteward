export const metadata = {
  platform: 'klenty',
  totalResources: 6,
  availableResources: ['contact'],
  unavailableResources: [
    {
      resource: 'activity',
      reason:
        'Klenty public REST API has no activity/task endpoint. Call logs are accessible via /calls (GET) but do not map to the canonical Activity schema. The platform is a sales-engagement tool and does not expose a general activity resource.',
    },
    {
      resource: 'company',
      reason:
        'Klenty public REST API has no company endpoint. Company data appears only as fields on a Prospect record (Company, CompanyDomain, CompanyPhone) and cannot be listed or fetched independently.',
    },
    {
      resource: 'deal',
      reason:
        'Klenty public REST API has no deal endpoint. Klenty is a sales-engagement/sequencing platform and does not manage deals or opportunities.',
    },
    {
      resource: 'note',
      reason:
        'Klenty public REST API has no note endpoint. Notes are not a resource exposed via the Klenty API.',
    },
    {
      resource: 'pipeline',
      reason:
        'Klenty public REST API has no pipeline endpoint. Klenty uses cadences (email/call sequences) rather than deal pipelines; no pipeline resource is documented.',
    },
  ],
} as const
