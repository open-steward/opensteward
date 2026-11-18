export const metadata = {
  platform: 'jobadder',
  totalResources: 6,
  availableResources: ['contact', 'company', 'deal', 'note', 'activity'],
  unavailableResources: [
    {
      resource: 'pipeline',
      reason:
        'JobAdder is an ATS, not a sales CRM; it has no deal pipeline concept. ' +
        'The workflow endpoints (/applications/lists/workflow, /companies/{id}/workflows) ' +
        'model approval flows for requisitions, not configurable sales stage pipelines.',
    },
  ],
} as const
