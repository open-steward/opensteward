import { w } from './helpers'
import type { BuiltinDashboard } from './types'

export const PROJECTS: BuiltinDashboard = {
  id: 'builtin:projects',
  name: 'Projects',
  description:
    'Active projects, where they stand, who owns them and how new work arrives across your project tools.',
  vertical: 'projects',
  widgets: [
    w('projects.active_projects', 'number', 3),
    w('projects.projects_overdue', 'number', 3),
    w('projects.projects_on_hold', 'number', 3),
    w('projects.projects_ending_soon', 'number', 3),
    w('projects.projects_by_status', 'donut', 6),
    w('projects.projects_created_per_day', 'line', 6),
    w('projects.projects_by_workspace', 'bar', 6),
    w('projects.projects_by_owner', 'hbar', 6),
    w('projects.project_age_buckets', 'bar', 12),
    w('projects.projects_created_per_day', 'calendar', 12, 'Project creation calendar'),
  ],
}

export const PROJECTS_RISK: BuiltinDashboard = {
  id: 'builtin:projects-risk',
  name: 'Projects risk',
  description:
    'Overdue, stale and ownerless projects, projects ending soon or on hold, and how much rests on a few owners.',
  vertical: 'projects',
  widgets: [
    w('projects.owner_concentration', 'gauge', 4),
    w('projects.projects_overdue', 'number', 4),
    w('projects.stale_projects', 'number', 4),
    w('projects.projects_missing_owner', 'number', 4),
    w('projects.projects_ending_soon', 'number', 4),
    w('projects.projects_on_hold', 'number', 4),
    w('projects.project_age_buckets', 'bar', 6),
    w('projects.owner_concentration', 'pareto', 6),
    w('projects.projects_by_status', 'donut', 6),
    w('projects.projects_by_owner', 'hbar', 6),
  ],
}
