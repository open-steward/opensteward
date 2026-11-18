import { z } from 'zod'

/**
 * User — platform user identity for assignee resolution.
 *
 * Deliberately PII-minimal. Refused: phone, location, calendar links,
 * custom-profile fields. Operators who need richer profiles read raw
 * upstream payloads via their own integrations.
 */
export const UserSchema = z.object({
  id: z.string().meta({ example: 'usr_jane' }),
  externalId: z.string().meta({ example: 'usr_jane' }),
  email: z.email().optional().meta({ example: 'jane.doe@acme.example' }),
  name: z.string().meta({ example: 'Jane Doe' }),
  workspaceIds: z.array(z.string().meta({ example: 'ws_acme' })),
  platform: z.string().meta({ example: 'asana' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type User = z.infer<typeof UserSchema>
