export const metadata = {
  platform: 'kantata',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Kantata stores tags as a comma-separated tag_list string on Story objects; there is no dedicated /tags.json list endpoint and tags are not first-class workspace-scoped resources.',
    },
    {
      resource: 'workspace',
      reason:
        'The canonical Workspace (top-level org/tenant) maps to a Kantata Account; no /accounts.json or equivalent list endpoint is documented in the Kantata OX API.',
    },
  ],
} as const
