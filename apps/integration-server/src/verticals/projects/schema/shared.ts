/**
 * Shared schema primitives for the projects vertical.
 *
 * Read-only B2B tenant-mode. Schema-as-firewall: no attachment content
 * (only `attachmentCount`), no time-tracking, no user PII beyond
 * `name` + `email`, no custom-field schemas (values land in metadata).
 */
import { z } from 'zod'
import { withUnknown } from '@opensteward/shared'

export const ProjectStatusSchema = withUnknown(['active', 'archived', 'completed', 'on_hold'])
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>

export const TaskStatusSchema = withUnknown([
  'open',
  'in_progress',
  'in_review',
  'closed',
  'cancelled',
])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const TaskPrioritySchema = withUnknown(['low', 'medium', 'high', 'urgent'])
export type TaskPriority = z.infer<typeof TaskPrioritySchema>
