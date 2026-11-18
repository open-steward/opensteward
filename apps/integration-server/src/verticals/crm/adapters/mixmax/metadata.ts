export const metadata = {
  platform: 'mixmax',
  totalResources: 6,
  availableResources: ['activity', 'contact', 'note'],
  unavailableResources: [
    {
      resource: 'company',
      reason: 'Mixmax REST API v1 exposes no companies endpoint; the platform is email-sequence-focused and has no organisation/account concept.',
    },
    {
      resource: 'deal',
      reason: 'Mixmax REST API v1 exposes no deals endpoint; deal tracking is not part of the Mixmax product.',
    },
    {
      resource: 'pipeline',
      reason: 'Mixmax REST API v1 exposes no pipelines endpoint; pipeline management is not part of the Mixmax product.',
    },
  ],
} as const
