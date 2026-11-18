/**
 * Microsoft To Do is exposed through the Microsoft Graph REST API. All
 * resources live under the signed-in user's mailbox (`/me/todo/...`).
 *
 * Graph has a single production base URL — there is no separate sandbox
 * host; apps test against real tenants registered in Microsoft Entra ID.
 */
export const API_BASE_URL = 'https://graph.microsoft.com/v1.0'

/**
 * Microsoft identity platform (Entra ID) v2.0 endpoints. `common` lets both
 * work/school (organizations) and personal Microsoft accounts sign in — the
 * broadest audience for a multi-tenant integration.
 */
export const OAUTH_TENANT = 'common'
export const OAUTH_AUTHORIZE_URL = `https://login.microsoftonline.com/${OAUTH_TENANT}/oauth2/v2.0/authorize`
export const OAUTH_TOKEN_URL = `https://login.microsoftonline.com/${OAUTH_TENANT}/oauth2/v2.0/token`

/** Graph caps `$top` at 999 for most collections; 100 is a safe default page. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Delegated permissions. `Tasks.Read` covers the read-only B2B posture;
 * `offline_access` is required to receive a refresh token; `User.Read`
 * resolves the signed-in user's identity for the synthetic workspace.
 * `MailboxSettings.Read` is required to enumerate Outlook categories
 * (GET /me/outlook/masterCategories), which are the canonical `Tag` resource.
 */
export const DEFAULT_SCOPES = ['offline_access', 'User.Read', 'Tasks.Read', 'MailboxSettings.Read']
