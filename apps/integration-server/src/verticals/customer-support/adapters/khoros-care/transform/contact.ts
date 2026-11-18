/**
 * Transform a Khoros Care author handle into the canonical Contact shape.
 *
 * `GET /api/v2/authors` returns `data.personList`, one entry per person, and
 * each person groups its per-network author records under
 * `handles.<network>[]`. Each handle carries its own `lswUuid`, "the unique
 * Care author ID" that `GET /api/v2/authors/{lswUuid}` takes and that a
 * conversation message names in `author.lswUuid`. One Contact is therefore
 * one handle, keyed by that `lswUuid`, with the person's `id` in metadata.
 * The handle's social-network user id and screen name stay out of metadata:
 * ContactSchema refuses social handles.
 *
 * Docs: https://developer.khoros.com/khoroscaredevdocs/reference/authors
 *       https://developer.khoros.com/khoroscaredevdocs/reference/authorslswuuid
 */
import type { Contact } from '../../../schema'
import { pickStr, required, strMap } from './shared'

export interface RawKhorosCareAuthorHandle {
  '@class'?: string
  lswUuid?: string
  displayNumber?: number
  id?: string
  name?: string
  screenName?: string
  profileUrl?: string
  providerInstanceId?: string
  networkinstance?: string
  [key: string]: unknown
}

export interface RawKhorosCarePerson {
  id?: string
  displayNumber?: number
  handles?: Record<string, RawKhorosCareAuthorHandle[] | undefined>
  [key: string]: unknown
}

/** Every handle of a person, in the order the payload lists them, with its network key. */
export function personHandles(
  person: RawKhorosCarePerson,
): Array<{ network: string; handle: RawKhorosCareAuthorHandle }> {
  const out: Array<{ network: string; handle: RawKhorosCareAuthorHandle }> = []
  for (const [network, list] of Object.entries(person.handles ?? {})) {
    for (const handle of list ?? []) out.push({ network, handle })
  }
  return out
}

export function transformContact(
  handle: RawKhorosCareAuthorHandle,
  network: string,
  person: RawKhorosCarePerson,
): Contact {
  const id = required(pickStr(handle.lswUuid), 'author handle lswUuid')
  return {
    id,
    externalId: id,
    // Scrubbed handles (e.g. Twitter's ScrubbedProviderSpecificAuthorData)
    // carry no `name`; the schema's name is a string, so that is an empty one.
    name: pickStr(handle.name) ?? '',
    platform: 'khoros-care',
    metadata: strMap({
      network,
      personId: person.id,
      personDisplayNumber: person.displayNumber,
      networkinstance: handle.networkinstance,
      displayNumber: handle.displayNumber,
    }),
    raw: { person: { id: person.id, displayNumber: person.displayNumber }, network, handle },
  }
}
