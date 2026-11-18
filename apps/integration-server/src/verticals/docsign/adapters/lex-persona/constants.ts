/**
 * Goodflag Signature Workflow Manager (formerly Lex Persona).
 *
 * "Les endpoints `Search *` acceptent : … `itemsPerPage` (**maximum 50**),
 * `pageIndex`. La réponse contient un tableau **`items`**."
 * (https://docs.goodflag.com/wm/api-reference/structure.md). The default
 * `itemsPerPage` is 50 on every search endpoint this adapter reads.
 */
export const MAX_PAGE_SIZE = 50
export const DEFAULT_PAGE_SIZE = 50
