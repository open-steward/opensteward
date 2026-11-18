export const metadata = {
  platform: 'openproject',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'OpenProject has no tag/label resource in the v3 API. No /tags or /labels endpoint exists; the community labels epic (work_packages/32181) has not shipped as of v17.',
    },
    {
      resource: 'workspace',
      reason:
        'OpenProject v17 introduced "workspace" as an umbrella term for Portfolio/Program/Project containers, but there is no GET /api/v3/workspaces list endpoint. The official docs state "there is no actual workspace resource in OpenProject." Projects are already mapped to the canonical Project resource.',
    },
  ],
} as const
