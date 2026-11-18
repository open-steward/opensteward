import { z } from 'zod'

/** User — agent identity. PII-minimal. */
export const UserSchema = z.object({
  id: z.string().meta({ example: 'usr_olivia' }),
  externalId: z.string().meta({ example: 'usr_olivia' }),
  email: z.email().optional().meta({ example: 'olivia.admin@northwind.example' }),
  name: z.string().meta({ example: 'Olivia Admin' }),
  role: z.string().optional().meta({ example: 'agent' }),
  teamIds: z.array(z.string().meta({ example: 'team_support' })),
  platform: z.string().meta({ example: 'zendesk' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type User = z.infer<typeof UserSchema>
