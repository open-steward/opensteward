/**
 * Huly API constants.
 *
 * Huly's REST API is served by the workspace's transactor, not by the web
 * front (https://huly.app). The in-app docs (Settings → API Tokens → "Using
 * the REST API", hcengineering/platform
 * plugins/setting-resources/src/components/ApiDocsSection.svelte) derive it
 * per deployment:
 *
 *   // The REST API is served by the transactor. Its address is returned by the
 *   // account service on authentication and stored as the login endpoint (a
 *   // ws(s):// URL); derive the http(s) base from it the same way other tools do.
 *
 * and show it to the user as "Base URL" (`<transactor>/api/v1`). There is no
 * fixed host to default to, so the base URL is collected at connect time.
 *
 * Class ids are `<plugin>:<kind>:<name>` — hcengineering/huly.core
 * packages/platform/src/platform.ts `identify()`:
 * `const ident = prefix + _ID_SEPARATOR + key` with `_ID_SEPARATOR = ':'`.
 */

/** tracker plugin (`trackerId = 'tracker'`), `class.Project`. */
export const CLASS_PROJECT = 'tracker:class:Project'

/** tracker plugin, `class.Issue`. */
export const CLASS_ISSUE = 'tracker:class:Issue'

/** chunter plugin (`chunterId = 'chunter'`), `class.ChatMessage`. */
export const CLASS_CHAT_MESSAGE = 'chunter:class:ChatMessage'

/** contact plugin (`contactId = 'contact'`), `mixin.Employee` — workspace members. */
export const CLASS_EMPLOYEE = 'contact:mixin:Employee'

/**
 * contact plugin, `class.SocialIdentity` — `interface SocialIdentity extends
 * SocialId, AttachedDoc { _id: Ref<this> & PersonId; attachedTo: Ref<Person> }`.
 * Resolves a `Doc.createdBy` PersonId to the Person a User row is keyed by.
 */
export const CLASS_SOCIAL_IDENTITY = 'contact:class:SocialIdentity'

/** tracker plugin, `ids.NoParent`: the `attachedTo` of a top-level issue. */
export const ISSUE_NO_PARENT = 'tracker:ids:NoParent'

/** `SortingOrder.Ascending` (huly.core packages/core/src/storage.ts). */
export const SORT_ASCENDING = 1

/** Token help URL — shown during Connect Link auth setup. */
export const TOKEN_HELP_URL = 'https://docs.huly.io/getting-started/api-tools/'

/**
 * Page size when a caller names none. Huly's FindOptions `limit` documents no
 * maximum, so the caller's limit is sent as is.
 */
export const DEFAULT_PAGE_SIZE = 50
