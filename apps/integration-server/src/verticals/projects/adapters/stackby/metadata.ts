export const metadata = {
  platform: 'stackby',
  totalResources: 6,
  availableResources: ['project', 'task'],
  unavailableResources: [
    {
      resource: 'comment',
      reason:
        'Stackby public API (betav1/v1) exposes no endpoint for row-level comments; comment threads are a UI-only feature.',
    },
    {
      resource: 'tag',
      reason:
        'Stackby has no tags concept or tags endpoint in its public API; labels are arbitrary user-defined column values.',
    },
    {
      resource: 'user',
      reason:
        'Stackby public API exposes no endpoint to list or retrieve workspace members or users.',
    },
    {
      resource: 'workspace',
      reason:
        'Stackby public API exposes no list-stacks or list-workspaces endpoint; callers must supply stack identifiers directly.',
    },
  ],
} as const
