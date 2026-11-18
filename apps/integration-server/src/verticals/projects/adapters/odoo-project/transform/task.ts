import type { Task } from '../../../schema/task'
import type { TaskPriority, TaskStatus } from '../../../schema/shared'
import {
  htmlText,
  many2oneId,
  many2oneName,
  meta,
  odooIso,
  strOrUndef,
  x2manyIds,
  type Many2one,
} from '../values'

/**
 * A `project.task` row (addons/project/models/project_task.py, 19.0):
 *   active = fields.Boolean(default=True, …)
 *   name = fields.Char(string='Title', tracking=True, required=True, index='trigram')
 *   description = fields.Html(string='Description', sanitize_attributes=False)
 *   priority = fields.Selection([('0', 'Low priority'), ('1', 'Medium priority'),
 *     ('2', 'High priority'), ('3', 'Urgent')], default='0', …)
 *   stage_id = fields.Many2one('project.task.type', string='Stage', …)
 *   tag_ids = fields.Many2many('project.tags', string='Tags')
 *   state = fields.Selection([('01_in_progress', 'In Progress'),
 *     ('02_changes_requested', 'Changes Requested'), ('03_approved', 'Approved'),
 *     *CLOSED_STATES.items(), ('04_waiting_normal', 'Waiting')], …)
 *     with CLOSED_STATES = {'1_done': 'Done', '1_canceled': 'Cancelled'}
 *   date_deadline = fields.Datetime(string='Deadline', …)
 *   project_id = fields.Many2one('project.project', string='Project', …, falsy_value_label=_lt("🔒 Private"))
 *   user_ids = fields.Many2many('res.users', relation='project_task_user_rel', …, string='Assignees', …)
 *   company_id = fields.Many2one('res.company', string='Company', …)
 *   parent_id = fields.Many2one('project.task', string='Parent Task', …)
 *   subtask_count = fields.Integer("Sub-task Count", compute='_compute_subtask_count', …)
 *   milestone_id = fields.Many2one('project.milestone', 'Milestone', …)
 *   create_date = fields.Datetime("Created On", …) / write_date = fields.Datetime("Last Updated On", …)
 *
 * Older versions (odoo/odoo 14.0–18.0 sources):
 *   - `state` is new in 17.0. Up to 16.0 the task has
 *     kanban_state = fields.Selection([('normal', 'In Progress'), ('done', 'Ready'),
 *       ('blocked', 'Blocked')], …)
 *     and is_closed = fields.Boolean(related="stage_id.is_closed", string="Closing Stage")
 *     (14.0, 15.0) / related="stage_id.fold" (16.0).
 *   - `priority` is [('0', 'Normal'), ('1', 'Important')] in 14.0–15.0 and
 *     [('0', 'Low'), ('1', 'High')] in 16.0–18.0, so '1' means High there and
 *     Medium on 19.0: see {@link taskPriority}.
 *   - `user_ids` is new in 15.0; 14.0 has one assignee,
 *     user_id = fields.Many2one('res.users', string='Assigned to', …).
 *   - `date_deadline` is a fields.Date up to 16.0.
 *   - `milestone_id` is new in 16.0.
 */
export interface RawOdooTask {
  id: number
  active?: boolean
  name?: string | false
  description?: string | false
  priority?: string | false
  stage_id?: Many2one
  tag_ids?: number[]
  state?: string | false
  kanban_state?: string | false
  is_closed?: boolean
  date_deadline?: string | false
  project_id?: Many2one
  user_ids?: number[]
  user_id?: Many2one
  company_id?: Many2one
  parent_id?: Many2one
  subtask_count?: number | false
  milestone_id?: Many2one
  create_date?: string | false
  write_date?: string | false
}

export const TASK_FIELDS = [
  'id',
  'active',
  'name',
  'description',
  'priority',
  'stage_id',
  'tag_ids',
  'state',
  'kanban_state',
  'is_closed',
  'date_deadline',
  'project_id',
  'user_ids',
  'user_id',
  'company_id',
  'parent_id',
  'subtask_count',
  'milestone_id',
  'create_date',
  'write_date',
]

/** 17.0+ `state`. "Changes Requested" is still work in progress; "Waiting" is blocked on dependencies. */
const STATE: Record<string, TaskStatus> = {
  '01_in_progress': 'in_progress',
  '02_changes_requested': 'in_progress',
  '03_approved': 'in_review',
  '04_waiting_normal': 'open',
  '1_done': 'closed',
  '1_canceled': 'cancelled',
}

/** 14.0–16.0 `kanban_state` on a task whose stage is not a closing one. */
const KANBAN_STATE: Record<string, TaskStatus> = {
  normal: 'in_progress',
  done: 'in_review',
  blocked: 'in_progress',
}

function taskStatus(raw: RawOdooTask): TaskStatus {
  const state = strOrUndef(raw.state)
  if (state) return STATE[state] ?? 'unknown'
  if (raw.is_closed === true) return 'closed'
  const kanban = strOrUndef(raw.kanban_state)
  return (kanban && KANBAN_STATE[kanban]) || 'unknown'
}

/**
 * `priority` by the server's own selection (its keys, in order, from
 * fields_get): four values are 19.0's Low / Medium / High / Urgent, two are
 * 14.0–18.0's Normal-or-Low / Important-or-High. Any other selection (a
 * module that redefines it) is left unmapped; the key stays in metadata.
 */
export function taskPriority(
  value: string | false | undefined,
  selection: readonly string[] | undefined,
): TaskPriority | undefined {
  if (typeof value !== 'string' || !selection) return undefined
  const order: readonly TaskPriority[] | undefined =
    selection.length === 4
      ? ['low', 'medium', 'high', 'urgent']
      : selection.length === 2
        ? ['low', 'high']
        : undefined
  const i = selection.indexOf(value)
  return order && i >= 0 ? order[i] : undefined
}

function assignees(raw: RawOdooTask): string[] {
  if (Array.isArray(raw.user_ids)) return x2manyIds(raw.user_ids)
  const one = many2oneId(raw.user_id)
  return one ? [one] : []
}

/**
 * @param prioritySelection the keys of project.task `priority` on this server
 *   (fields_get `selection`), or undefined when unknown: priority is then left out.
 */
export function transformTask(raw: RawOdooTask, prioritySelection?: readonly string[]): Task {
  const priority = taskPriority(raw.priority, prioritySelection)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    // A private task (no project) has none: "🔒 Private".
    projectId: many2oneId(raw.project_id) ?? '',
    parentId: many2oneId(raw.parent_id),
    title: strOrUndef(raw.name) ?? '',
    description: htmlText(raw.description),
    status: taskStatus(raw),
    ...(priority ? { priority } : {}),
    dueDate: odooIso(raw.date_deadline),
    assigneeIds: assignees(raw),
    tagIds: x2manyIds(raw.tag_ids),
    subtaskCount: typeof raw.subtask_count === 'number' ? raw.subtask_count : undefined,
    createdAt: odooIso(raw.create_date),
    updatedAt: odooIso(raw.write_date),
    platform: 'odoo-project',
    metadata: meta({
      platformType: raw.parent_id ? 'subtask' : 'task',
      stageId: many2oneId(raw.stage_id),
      stageName: many2oneName(raw.stage_id),
      state: strOrUndef(raw.state),
      kanbanState: strOrUndef(raw.kanban_state),
      priority: strOrUndef(raw.priority),
      milestoneId: many2oneId(raw.milestone_id),
      companyId: many2oneId(raw.company_id),
      active: typeof raw.active === 'boolean' ? String(raw.active) : undefined,
    }),
    raw,
  }
}
