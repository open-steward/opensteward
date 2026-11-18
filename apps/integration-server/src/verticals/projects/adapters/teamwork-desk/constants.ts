/**
 * Teamwork Spaces API constants.
 *
 * The REST base URL is site-scoped: https://{siteName}.teamwork.com/spaces/api/v1/
 * The siteName is provided by the user at connect time and stored in
 * credentials.extra.siteUrl so the client can build the correct base URL.
 *
 * Authentication: Authorization: Bearer {apiKey}
 * Pagination:     none documented; list endpoints return whole collections.
 */

/** Token-help URL shown in the Connect Link form. */
export const TOKEN_HELP_URL = 'https://support.teamwork.com/spaces/settings/managing-your-api-keys'
