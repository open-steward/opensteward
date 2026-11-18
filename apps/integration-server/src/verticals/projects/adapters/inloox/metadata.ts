export const metadata = {
  platform: 'inloox',
  totalResources: 6,
  availableResources: ['project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'comment',
      reason: 'InLoox OData API (v1) exposes no comment or discussion endpoint; confirmed via Microsoft Learn connector docs and official Swagger.',
    },
    {
      resource: 'tag',
      reason: 'InLoox OData API (v1) exposes no tag or label endpoint; confirmed via Microsoft Learn connector docs and official Swagger.',
    },
    {
      resource: 'workspace',
      reason: 'InLoox OData API (v1) exposes no workspace or portfolio listing endpoint; confirmed via Microsoft Learn connector docs and official Swagger.',
    },
  ],
} as const
