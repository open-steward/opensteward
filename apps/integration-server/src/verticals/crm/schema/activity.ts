import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'

export const ActivitySchema = z
  .object({
    id: z.string().describe('Platform-specific activity identifier.').meta({ example: 'act_discovery' }),
    type: z
      .string()
      .optional()
      .describe('Activity kind — typical values: `call`, `email`, `meeting`, `task`, `deadline`, `lunch`.')
      .meta({ example: 'call' }),
    subject: z.string().optional().describe('Short activity title.').meta({ example: 'Discovery call' }),
    note: z.string().optional().describe('Free-form body / agenda / follow-up notes.').meta({ example: 'Follow up on Q1 expansion' }),
    contact_id: z.string().optional().describe('Contact.id the activity is linked to.').meta({ example: 'cont_jane' }),
    company_id: z.string().optional().describe('Company.id the activity is linked to.').meta({ example: 'co_acme' }),
    deal_id: z.string().optional().describe('Deal.id the activity is linked to.').meta({ example: 'deal_1042' }),
    owner_id: z.string().optional().describe('Platform user who owns the activity.').meta({ example: 'usr_olivia' }),
    due_date: IsoDatetime.optional().describe('Scheduled or due time as ISO 8601.').meta({ example: '2026-02-01T14:20:00Z' }),
    done: z.boolean().optional().describe('Whether the activity has been completed.').meta({ example: true }),
    duration_minutes: z.number().int().min(0).optional().describe('Planned or actual duration in minutes.').meta({ example: 30 }),
    created_at: IsoDatetime.optional().describe('ISO 8601 timestamp when the activity was created.').meta({ example: '2026-01-15T09:30:00Z' }),
    updated_at: IsoDatetime.optional().describe('ISO 8601 timestamp of the last modification.').meta({ example: '2026-02-01T14:20:00Z' }),
    metadata: z
      .record(z.string(), z.unknown())
      .describe('Complete unmodified raw platform response.'),
  })
  .describe('A scheduled or logged interaction — call, email, meeting, task.')
export type Activity = z.infer<typeof ActivitySchema>
