export const metadata = {
  platform: 'suiteprojects-pro',
  totalResources: 6,
  availableResources: ['comment', 'project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'No tag or label concept exists in the SuiteProjects Pro REST API (confirmed in official 2026.1 REST API reference; complete endpoint list contains no /tags/ resource).',
    },
    {
      resource: 'workspace',
      reason:
        'No workspace endpoint exists in the SuiteProjects Pro REST API. The "Workspace" concept in SuiteProjects Pro refers to a file-storage module for document attachments, not a project-management organisational container; it is not exposed as a listable REST resource (confirmed in official 2026.1 REST API reference).',
    },
  ],
} as const
