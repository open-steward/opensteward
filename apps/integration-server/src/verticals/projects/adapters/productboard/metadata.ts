export const metadata = {
  platform: 'productboard',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Tags on notes are plain strings with no id or color; no workspace-level tag listing endpoint exists in the Productboard v1 API',
    },
    {
      resource: 'workspace',
      reason:
        'A token addresses a single id-less workspace; no /workspace endpoint or workspace id/name is exposed by the Productboard v1 API',
    },
  ],
} as const
