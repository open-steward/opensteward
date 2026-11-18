/**
 * Clientify links related records by hyperlink, not by id: a deal's
 * `"contact": "https://api.clientify.net/v1/contacts/65542/"`, a task's
 * `"deals": ["https://api.clientify.net/v1/deals/132468/"]` (List Deals, Task
 * Details; https://developer.clientify.com/). The id is the link's last path
 * segment, which is the same id the record's own `id` field carries.
 *
 * Returns undefined for a missing link or one whose last segment is not a
 * numeric id, rather than guessing.
 */
export function idFromUrl(url: string | null | undefined): string | undefined {
  if (typeof url !== 'string') return undefined
  const m = /\/(\d+)\/?$/.exec(url)
  return m ? m[1] : undefined
}
