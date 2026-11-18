/**
 * LogiCommerce returns translatable text as a `LANGUAGES` array, one entry
 * per store language, e.g. GET /products: `"LANGUAGES": [{ "LANGUAGE": "ES",
 * "LONGDESCRIPTION": "Product long description", "NAME": "Product name", … }]`
 * (https://api-sync.logicommerce.cloud/docs/reference.cfm?module=products&languageId=2).
 *
 * The adapter sends no `languageCode`, so every language comes back. The
 * canonical record takes its text from ONE entry: the first whose `NAME` is
 * a non-empty string, else the first entry. Categories document `"NAME": ""`
 * as a possible value, so an entry may exist with no name.
 */
export interface RawLanguageEntry {
  LANGUAGE?: string
  NAME?: string
  LONGDESCRIPTION?: string
  SHORTDESCRIPTION?: string
  [key: string]: unknown
}

export function pickLanguage(
  languages: RawLanguageEntry[] | undefined,
): RawLanguageEntry | undefined {
  if (!Array.isArray(languages) || languages.length === 0) return undefined
  return languages.find((l) => typeof l.NAME === 'string' && l.NAME !== '') ?? languages[0]
}

/** The picked entry's NAME. Throws when no entry carries a NAME string: the canonical title is required. */
export function requireName(
  what: string,
  id: unknown,
  languages: RawLanguageEntry[] | undefined,
): { name: string; entry: RawLanguageEntry } {
  const entry = pickLanguage(languages)
  if (!entry || typeof entry.NAME !== 'string') {
    throw new Error(
      `LogiCommerce ${what} ${String(id)} has no LANGUAGES[].NAME to use as its title`,
    )
  }
  return { name: entry.NAME, entry }
}

/** A documented numeric or string `ID`, as the canonical string id. Throws when absent. */
export function requireId(what: string, id: unknown): string {
  if (typeof id === 'number' && Number.isFinite(id)) return String(id)
  if (typeof id === 'string' && id !== '') return id
  throw new Error(`LogiCommerce ${what} has no ID`)
}
