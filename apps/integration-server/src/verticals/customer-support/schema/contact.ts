import { z } from 'zod'

/**
 * Contact — customer identity. Deliberately PII-minimal.
 *
 * Refused: social handles, geo, custom-attribute clouds, lifecycle stage,
 * marketing-consent flags. Operators with richer profile needs use the
 * crm vertical alongside.
 */
export const ContactSchema = z.object({
  id: z.string().meta({ example: 'cnt_jane' }),
  externalId: z.string().meta({ example: 'cnt_jane' }),
  email: z.email().optional().meta({ example: 'jane.doe@acme.example' }),
  name: z.string().meta({ example: 'Jane Doe' }),
  phone: z.string().optional().meta({ example: '+14155550123' }),
  organizationId: z.string().optional().meta({ example: 'org_acme' }),
  platform: z.string().meta({ example: 'zendesk' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Contact = z.infer<typeof ContactSchema>
