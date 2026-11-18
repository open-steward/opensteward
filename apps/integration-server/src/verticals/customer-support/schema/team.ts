import { z } from 'zod'

export const TeamSchema = z.object({
  id: z.string().meta({ example: 'team_support' }),
  externalId: z.string().meta({ example: 'team_support' }),
  name: z.string().meta({ example: 'Support' }),
  memberCount: z.number().int().min(0).optional().meta({ example: 12 }),
  platform: z.string().meta({ example: 'zendesk' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Team = z.infer<typeof TeamSchema>
