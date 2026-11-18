import { z } from 'zod'

/**
 * Macro — canned response template.
 *
 * Platforms without canned-response surface return [] for listMacros.
 */
export const MacroSchema = z.object({
  id: z.string().meta({ example: 'mac_login_reset' }),
  externalId: z.string().meta({ example: 'mac_login_reset' }),
  title: z.string().meta({ example: 'Login / password reset' }),
  body: z.string().meta({
    example: 'Hi, please try resetting your password again using the link below.',
  }),
  category: z.string().optional().meta({ example: 'Account access' }),
  platform: z.string().meta({ example: 'zendesk' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Macro = z.infer<typeof MacroSchema>
