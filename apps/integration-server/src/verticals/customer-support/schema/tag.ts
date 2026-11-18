import { z } from 'zod'

export const TagSchema = z.object({
  id: z.string().meta({ example: 'tag_login' }),
  externalId: z.string().meta({ example: 'tag_login' }),
  name: z.string().meta({ example: 'login' }),
  color: z.string().optional().meta({ example: '#e53935' }),
  platform: z.string().meta({ example: 'zendesk' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Tag = z.infer<typeof TagSchema>
