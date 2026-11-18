export const metadata = {
  platform: 'twproject',
  totalResources: 6,
  availableResources: ['project', 'task', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason:
        'Twproject has no tagging or label API; the REST API V1 objects are limited to task, assignment, issue, person, company, worklog, and cost — no tag or label concept exists.',
    },
    {
      resource: 'comment',
      reason:
        'Its API has no comment object (objectType is one of "task", "issue", "person", "company", "assignment", "worklog", …), and issue comments can only be added with "addComment" ("This allows you to add a comment to an existing issue with the given id"), never read back.',
    },
    {
      resource: 'workspace',
      reason:
        'Its API has no workspace object (objectType is one of "task", "issue", "person", "company", "assignment", "worklog", …); each self-hosted server is a single tenant.',
    },
  ],
} as const
