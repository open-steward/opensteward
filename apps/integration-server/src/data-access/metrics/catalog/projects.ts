/**
 * Projects metrics. Paths are camelCase; enums are lower case. Only
 * `workspaces` and `projects` are synced, so there are no task metrics.
 *
 * A project has no completion date, so timing metrics use `endDate` (the
 * planned end) and `updatedAt` (last change) as proxies. Owners are shown by
 * id; `description` is PII and never read.
 *
 * Common sets:
 *   OPEN — status `active` or `on_hold` (not completed, not archived)
 */
import type { MetricFilter, ResourceMetricDefinition } from '../types'

const OPEN: MetricFilter = { field: 'status', op: 'in', value: ['active', 'on_hold'] }
const ACTIVE: MetricFilter = { field: 'status', op: 'eq', value: 'active' }

const WORKSPACE_NAME = { resourceType: 'workspaces', key: 'id', label: 'name' } as const
const DATE_NOTE =
  'The planned end date (`endDate`) is used; projects with no end date cannot be judged and are not counted.'

export const PROJECTS_METRICS: readonly ResourceMetricDefinition[] = [
  // ── Overview ─────────────────────────────────────────────────────────────
  {
    id: 'projects.projects_by_status',
    title: 'Projects by status',
    description: 'Every project by status now.',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'overview',
    kind: 'breakdown',
    snapshot: true,
    measure: { op: 'count' },
    group: { field: 'status', order: ['active', 'on_hold', 'completed', 'archived', 'unknown'] },
  },
  {
    id: 'projects.active_projects',
    title: 'Active projects',
    description: 'Projects in the active status now.',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'overview',
    kind: 'value',
    snapshot: true,
    measure: { op: 'count' },
    filters: [ACTIVE],
  },
  {
    id: 'projects.projects_created_per_day',
    title: 'Projects created per day',
    description: 'Projects by the date they were created.',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'overview',
    kind: 'timeseries',
    measure: { op: 'count' },
    dateField: 'createdAt',
  },

  // ── Workload ─────────────────────────────────────────────────────────────
  {
    id: 'projects.projects_by_workspace',
    title: 'Open projects by workspace',
    description: 'Active and on-hold projects now, per workspace (workspace name when synced).',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'workload',
    kind: 'breakdown',
    snapshot: true,
    measure: { op: 'count' },
    group: { field: 'workspaceId', lookup: WORKSPACE_NAME },
    filters: [OPEN],
  },
  {
    id: 'projects.projects_by_owner',
    title: 'Open projects by owner',
    description: 'Active and on-hold projects now, per owner.',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'workload',
    kind: 'breakdown',
    snapshot: true,
    measure: { op: 'count' },
    group: { field: 'ownerId' },
    filters: [OPEN],
    note: 'Owners are shown by id; names are personal data. Projects with no owner show as "(none)".',
  },

  // ── Risk ─────────────────────────────────────────────────────────────────
  {
    id: 'projects.projects_overdue',
    title: 'Overdue projects',
    description: 'Active and on-hold projects whose end date has passed, now.',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'risk',
    kind: 'value',
    snapshot: true,
    measure: { op: 'count' },
    filters: [OPEN, { field: 'endDate', op: 'before_now' }],
    thresholds: { warn: 1, crit: 5, direction: 'above' },
    note: DATE_NOTE,
  },
  {
    id: 'projects.projects_ending_soon',
    title: 'Projects ending in 14 days',
    description: 'Active projects with an end date today or in the next 14 days.',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'risk',
    kind: 'value',
    snapshot: true,
    measure: { op: 'count' },
    filters: [ACTIVE, { field: 'endDate', op: 'within_next_days', value: 14 }],
    note: DATE_NOTE,
  },
  {
    id: 'projects.projects_on_hold',
    title: 'Projects on hold',
    description: 'Projects paused in the on-hold status now.',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'risk',
    kind: 'value',
    snapshot: true,
    measure: { op: 'count' },
    filters: [{ field: 'status', op: 'eq', value: 'on_hold' }],
  },
  {
    id: 'projects.projects_missing_owner',
    title: 'Projects with no owner',
    description: 'Active and on-hold projects with no owner recorded, now.',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'risk',
    kind: 'value',
    snapshot: true,
    measure: { op: 'count' },
    filters: [OPEN, { field: 'ownerId', op: 'is_null' }],
    thresholds: { warn: 1, crit: 10, direction: 'above' },
    note: 'Some platforms do not report an owner at all; then every project counts.',
  },
  {
    id: 'projects.stale_projects',
    title: 'Stale projects',
    description: 'Active projects not changed in the last 30 days, now.',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'risk',
    kind: 'value',
    snapshot: true,
    measure: { op: 'count' },
    filters: [ACTIVE, { field: 'updatedAt', op: 'older_than_days', value: 30 }],
    thresholds: { warn: 1, crit: 10, direction: 'above' },
    note: 'Proxy: the last change of the project record stands in for the last work on it; task activity is not synced.',
  },
  {
    id: 'projects.project_age_buckets',
    title: 'Open projects by age',
    description:
      'Active and on-hold projects now, by days since they were created (up to 30, 31–90, 91–180, 181–365, over 365).',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'risk',
    kind: 'aging',
    snapshot: true,
    field: 'createdAt',
    direction: 'past',
    buckets: [30, 90, 180, 365],
    measure: { op: 'count' },
    filters: [OPEN],
    note: 'Projects with no creation date show as "No date".',
  },
  {
    id: 'projects.owner_concentration',
    title: 'Owner concentration',
    description:
      'How much of the open project load sits with the busiest owners: top 1, 3 and 5 shares, HHI and effective number.',
    vertical: 'projects',
    resourceType: 'projects',
    section: 'risk',
    kind: 'concentration',
    snapshot: true,
    measure: { op: 'count' },
    group: { field: 'ownerId' },
    topN: [1, 3, 5],
    filters: [OPEN],
    thresholds: { warn: 40, crit: 60, direction: 'above' },
    note: 'Owners are shown by id. Projects with no owner are left out of the shares. HHI above 1500 is moderately, above 2500 highly concentrated.',
  },
]
