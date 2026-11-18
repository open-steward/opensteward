/**
 * Xentral ERP REST API constants.
 *
 * Base URL: https://{xentralId}.xentral.biz  (one instance per tenant)
 * Auth: Bearer token — Personal Access Token stored in credentials.accessToken;
 *       instance subdomain stored in credentials.extra.xentralId.
 * Pagination (V1): deepObject query params page[number] + page[size];
 *                  response envelope: { data: T[], extra: { totalCount, page } }
 * Rate-limiting: standard 429 / 5xx retry with exponential back-off.
 */

/** Page size for list endpoints. V1 accepts 10–50; capped at 50 for safety. */
export const DEFAULT_PAGE_SIZE = 50
