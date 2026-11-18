export const metadata = {
  platform: 'cloze',
  totalResources: 6,
  availableResources: ['contact', 'company', 'deal', 'note'],
  unavailableResources: [
    {
      resource: 'activity',
      reason:
        'Cloze timeline is write-only via /v1/timeline/content/create; no list or get endpoints exist for individual activity records.',
    },
    {
      resource: 'pipeline',
      reason:
        'Cloze has no pipeline resource — projects carry a stage field, and account-level stage metadata endpoints return key/label maps only, not pipeline objects.',
    },
  ],
} as const
