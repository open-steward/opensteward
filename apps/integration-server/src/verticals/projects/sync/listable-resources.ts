/**
 * LISTABLE_RESOURCES — the (resourceType, adapter method) pairs the
 * background sync worker iterates over. Tasks/comments/tags/users are
 * scoped (project_id / task_id / workspace_id) so they fan out from
 * the top-level listables.
 */
export const LISTABLE_RESOURCES: Array<{ resourceType: string; method: string }> = [
  { resourceType: 'workspaces', method: 'listWorkspaces' },
  { resourceType: 'projects', method: 'listProjects' },
]
