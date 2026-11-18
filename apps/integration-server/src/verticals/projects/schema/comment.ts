import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'

/**
 * Comment — body text on a task or project.
 *
 * Includes the full text body, same posture as customer-support
 * messages and docsign audit-trail descriptions. Attachment CONTENT
 * is refused — only `attachmentCount` is surfaced.
 */
export const CommentSchema = z.object({
  id: z.string().meta({ example: 'cmt_1042' }),
  externalId: z.string().meta({ example: 'cmt_1042' }),
  taskId: z.string().optional().meta({ example: 'task_1042' }),
  projectId: z.string().optional().meta({ example: 'proj_1042' }),
  authorId: z.string().meta({ example: 'usr_jane' }),
  body: z.string().meta({ example: 'Scheduled for Monday 10am.' }),
  mentions: z.array(z.string().meta({ example: 'usr_olivia' })).describe('Referenced user ids.'),
  attachmentCount: z.number().int().min(0).optional().describe(
    'Derived count. Attachment content is not part of the canonical schema; only the count is surfaced.',
  ).meta({ example: 0 }),
  createdAt: IsoDatetime.meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  platform: z.string().meta({ example: 'asana' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Comment = z.infer<typeof CommentSchema>
