/**
 * Kore.ai XO Platform / SmartAssist (Contact Center) API constants.
 *
 * Base URL: https://bots.kore.ai
 * All contact-center endpoints live under:
 *   /agentassist/api/v1/public/{streamId}/…
 *
 * Authentication uses a short-lived JWT (HS256, signed with the app Client
 * Secret) delivered in the `auth` header; the Account ID is a separate
 * required header `accountId`.
 */

/** Production host — customers may override via credentials.extra.host */
export const DEFAULT_HOST = 'https://bots.kore.ai'

/** Path prefix for all contact-center public APIs */
export const CC_API_PREFIX = '/agentassist/api/v1/public'

/** Default page size used when the caller does not specify a limit */
export const DEFAULT_PAGE_SIZE = 50
