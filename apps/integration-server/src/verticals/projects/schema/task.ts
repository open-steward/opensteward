import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import { TaskStatusSchema, TaskPrioritySchema } from './shared'

export const TaskSchema = z.object({
  id: z.string().meta({ example: 'task_1042' }),
  externalId: z.string().meta({ example: 'task_1042' }),
  projectId: z.string().meta({ example: 'proj_1042' }),
  parentId: z.string().optional().describe(
    'Flat-with-parent-pointer hierarchy. Jira: epic→story→subtask via parentId chain. Asana: subtask. Linear: sub-issue.',
  ).meta({ example: 'proj_1042' }),
  title: z.string().meta({ example: 'Kickoff call' }),
  description: z.string().optional().describe('Ticket body. Included verbatim.').meta({ example: 'Onboard Acme Industries onto the platform.' }),
  status: TaskStatusSchema.meta({ example: 'in_progress' }),
  priority: TaskPrioritySchema.optional().meta({ example: 'high' }),
  dueDate: IsoDatetime.optional().meta({ example: '2026-02-15T17:00:00Z' }),
  assigneeIds: z.array(z.string().meta({ example: 'usr_jane' })),
  tagIds: z.array(z.string().meta({ example: 'tag_onboarding' })),
  subtaskCount: z.number().int().min(0).optional().describe('Derived count.').meta({ example: 3 }),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  platform: z.string().meta({ example: 'asana' }),
  metadata: z.record(z.string(), z.string()).describe(
    "Platform-specific level semantics live here under metadata.platformType ('epic'/'story'/'subtask'/'subissue'/etc.).",
  ),
  raw: z.unknown().optional(),
})
export type Task = z.infer<typeof TaskSchema>
