/**
 * Virto Commerce "auth" helpers.
 *
 * Virto Commerce is self-hosted per customer, with no central OAuth
 * application to authorize against — each instance's admin issues its own
 * static API keys (Security → Users → API keys). The adapter therefore:
 *
 *  - Points `getAuthUrl` at the (per-connection) instance's login page —
 *    informational only, not a functional OAuth authorize URL, and only
 *    resolvable once a platform URL has been configured.
 *  - Throws from `exchangeCode` so a caller that mistakenly tries the OAuth
 *    flow fails loudly instead of silently doing nothing.
 *
 * Docs: https://docs.virtocommerce.org/ (platform developer guide,
 * authentication) and the live demo Swagger's `securitySchemes`.
 */
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(platformUrl?: string): string {
  const base = platformUrl ?? 'https://your-instance.example.com'
  return `${base.replace(/\/$/, '')}/security/users`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Virto Commerce does not use OAuth code exchange. Generate an API key under ' +
      'Platform Manager → Security → Users → (select user) → API keys, then POST it ' +
      'to /v1/connections with body ' +
      '`{platform: "virto-commerce", credentials: {apiKey, platformUrl}}`.',
  )
}
