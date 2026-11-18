import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'

export const NoteSchema = z
  .object({
    id: z.string().describe('Platform-specific note identifier.').meta({ example: 'note_q1' }),
    content: z.string().describe('Free-form note body.').meta({ example: 'Follow up on Q1 expansion' }),
    contact_id: z.string().optional().describe('Contact.id the note is attached to.').meta({ example: 'cont_jane' }),
    company_id: z.string().optional().describe('Company.id the note is attached to.').meta({ example: 'co_acme' }),
    deal_id: z.string().optional().describe('Deal.id the note is attached to.').meta({ example: 'deal_1042' }),
    owner_id: z.string().optional().describe('Platform user who authored the note.').meta({ example: 'usr_olivia' }),
    created_at: IsoDatetime.optional().describe('ISO 8601 timestamp when the note was created.').meta({ example: '2026-01-15T09:30:00Z' }),
    updated_at: IsoDatetime.optional().describe('ISO 8601 timestamp of the last modification.').meta({ example: '2026-02-01T14:20:00Z' }),
    metadata: z
      .record(z.string(), z.unknown())
      .describe('Complete unmodified raw platform response.'),
  })
  .describe('A free-form note attached to a contact, company, or deal.')
export type Note = z.infer<typeof NoteSchema>
