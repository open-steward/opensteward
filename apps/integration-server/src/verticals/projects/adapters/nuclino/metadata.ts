export const metadata = {
  platform: 'nuclino',
  totalResources: 6,
  availableResources: ['workspace', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'comment',
      reason: 'Nuclino has no comment endpoint in its public REST API; threaded comments are UI-only and not exposed via /v0.',
    },
    {
      resource: 'tag',
      reason: 'Nuclino has no tag or label concept in its public REST API; the closest equivalent (select/multiSelect custom fields) are item-level structured fields, not tags.',
    },
  ],
} as const
