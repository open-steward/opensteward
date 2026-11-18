import { z } from 'zod'

export const WebhookResourceTypeSchema = z.enum([
  'projects',
  'tasks',
  'comments',
  'tags',
  'workspaces',
  'users',
  'unknown',
])
export type WebhookResourceType = z.infer<typeof WebhookResourceTypeSchema>

export const WebhookActionSchema = z.enum([
  'created',
  'updated',
  'deleted',
  'assigned',
  'unassigned',
  'completed',
  'reopened',
  'commented',
  'mentioned',
  'unknown',
])
export type WebhookAction = z.infer<typeof WebhookActionSchema>

export const WebhookEventSchema = z.object({
  id: z.string().optional().meta({ example: 'evt_1042' }),
  platform: z.string().meta({ example: 'asana' }),
  type: z.string().meta({ example: 'task.updated' }),
  resourceType: WebhookResourceTypeSchema.meta({ example: 'tasks' }),
  action: WebhookActionSchema.meta({ example: 'updated' }),
  resourceId: z.string().meta({ example: 'task_1042' }),
  projectId: z.string().optional().meta({ example: 'proj_1042' }),
  payload: z.record(z.string(), z.unknown()),
})
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
