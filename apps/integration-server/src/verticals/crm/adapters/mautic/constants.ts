export const DEFAULT_INSTANCE_URL = 'https://demo.mautic.org'
export const DEFAULT_PAGE_SIZE = 25
/**
 * Per-event-type `limit` sent to GET /contacts/activity: Mautic's own default
 * there (`$request->get('limit', 25)`). Fixed so row positions never depend on
 * the caller's page size.
 */
export const ACTIVITY_UPSTREAM_LIMIT = 25
