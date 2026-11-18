export const metadata = {
  platform: 'corefactors',
  totalResources: 6,
  availableResources: ['contact'],
  unavailableResources: [
    {
      resource: 'activity',
      reason: 'UNVERIFIED: Corefactors only publishes a Lead API (/leadapi) and List Management API (/listmgmtapi); no public REST endpoint for activities was found in any accessible documentation.',
    },
    {
      resource: 'company',
      reason: 'UNVERIFIED: Corefactors only publishes a Lead API (/leadapi) and List Management API (/listmgmtapi); no public REST endpoint for companies/accounts was found in any accessible documentation.',
    },
    {
      resource: 'deal',
      reason: 'UNVERIFIED: Corefactors only publishes a Lead API (/leadapi) and List Management API (/listmgmtapi); no public REST endpoint for deals was found in any accessible documentation.',
    },
    {
      resource: 'note',
      reason: 'UNVERIFIED: Corefactors only publishes a Lead API (/leadapi) and List Management API (/listmgmtapi); no public REST endpoint for notes was found in any accessible documentation.',
    },
    {
      resource: 'pipeline',
      reason: 'UNVERIFIED: Corefactors only publishes a Lead API (/leadapi) and List Management API (/listmgmtapi); no public REST endpoint for pipelines was found in any accessible documentation.',
    },
  ],
} as const
