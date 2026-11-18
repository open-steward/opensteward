export const metadata = {
  platform: 'userlike',
  totalResources: 7,
  availableResources: ['contact', 'message', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'macro',
      reason:
        'Userlike (Lime Connect) JSON API v3 exposes no endpoint for macros/canned responses; the feature exists only in the UI.',
    },
    {
      resource: 'tag',
      reason:
        'Userlike (Lime Connect) JSON API v3 exposes no tags endpoint; conversation tags are not accessible via the REST API.',
    },
    {
      resource: 'team',
      reason:
        'Userlike (Lime Connect) JSON API v3 has no teams/groups endpoint; operator grouping is not exposed through the REST API.',
    },
  ],
} as const
