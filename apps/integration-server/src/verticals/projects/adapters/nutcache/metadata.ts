export const metadata = {
  platform: 'nutcache',
  totalResources: 6,
  availableResources: ['project', 'user', 'workspace'],
  unavailableResources: [
    {
      resource: 'comment',
      reason: 'Nutcache public REST API (https://apps.nutcache.com/webapi) exposes no comments or notes endpoint; confirmed by full docs navigation at https://nutcache.github.io/apidocs/',
    },
    {
      resource: 'tag',
      reason: 'Nutcache public REST API exposes no tags or labels endpoint; confirmed by full docs navigation at https://nutcache.github.io/apidocs/',
    },
    {
      resource: 'task',
      reason: 'Nutcache public REST API exposes no tasks endpoint; the platform manages tasks internally but does not surface them via any documented REST endpoint; confirmed by full docs navigation at https://nutcache.github.io/apidocs/',
    },
  ],
} as const
