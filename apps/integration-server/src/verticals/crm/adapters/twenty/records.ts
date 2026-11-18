/**
 * Pieces every Twenty standard object shares.
 *
 * "Every object also gets automatic system fields: `id`, `createdAt`,
 * `updatedAt`, `createdBy`, and `position`."
 * (https://docs.twenty.com/getting-started/core-concepts/data-model.md)
 *
 * `createdBy` is an ActorMetadata composite, twenty-shared
 * src/types/composite-types/actor.composite-type.ts:
 *   `{ source: FieldActorSource; workspaceMemberId: string | null; name: string; context }`
 */
export interface RawTwentyActor {
  source?: string
  workspaceMemberId?: string | null
  name?: string
  [key: string]: unknown
}

export interface RawTwentyRecord {
  id?: string
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
  createdBy?: RawTwentyActor | null
  [key: string]: unknown
}

/** A record id is required: never serve a record under an invented one. */
export function recordId(raw: RawTwentyRecord, object: string): string {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error(`Twenty ${object} record has no id`)
  }
  return raw.id
}

/**
 * Twenty stores an unset composite sub-field or text field as '' (the
 * composite types declare them `string`, not `string | null`), so an empty
 * string is the absence of a value, not a value.
 */
export function present(value: string | null | undefined): string | undefined {
  return value == null || value === '' ? undefined : value
}
