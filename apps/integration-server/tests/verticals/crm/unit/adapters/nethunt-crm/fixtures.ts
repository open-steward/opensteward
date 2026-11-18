/**
 * Fixtures built from the documented examples in the NetHunt Public REST API
 * OpenAPI document, https://nethunt.com/api/openapi.json (fetched 2026-09-25):
 * components.schemas.Record, Folder, Field and CommentTimelineItem.
 *
 * One exception: CommentTimelineItem.text is documented only as
 * {"type":"string"}, with no example, so its value below is a placeholder
 * string of the documented type, not a documented example.
 */
import type {
  NetHuntCommentEvent,
  NetHuntFolder,
  NetHuntRecord,
} from '../../../../../../src/verticals/crm/adapters/nethunt-crm/types'

/** components.schemas.Record, every property from its `example`. */
export function documentedRecord(overrides: Partial<NetHuntRecord> = {}): NetHuntRecord {
  return {
    id: '5f8a2b1c3d4e5f6a7b8c9d0e',
    folderId: '5f8a2b1c3d4e5f6a7b8c9d0f',
    createdAt: 1742292000000,
    createdISO: '2025-03-18T10:00:00.000Z',
    updatedAt: 1742394191000,
    updatedISO: '2025-03-19T14:23:11.000Z',
    fields: {
      '2': 'Active',
      '3': 150000,
      '4': 'john@acme.com',
      '5': ['enterprise', 'priority'],
      '6': 1743465600000,
      name: 'Acme Corp',
    },
    ...overrides,
  }
}

/** components.schemas.Folder, from its `example`s, with a role. */
export function documentedFolder(overrides: Partial<NetHuntFolder> = {}): NetHuntFolder {
  return {
    id: '5f8a2b1c3d4e5f6a7b8c9d0e',
    name: 'Contacts',
    description: 'Company contacts used by sales.',
    createdAt: 1742292000000,
    createdISO: '2025-03-18T10:00:00.000Z',
    updatedAt: 1742394191000,
    updatedISO: '2025-03-19T14:23:11.000Z',
    ...overrides,
  }
}

/** components.schemas.CommentTimelineItem, from its `example`s. */
export function documentedComment(
  overrides: Partial<NetHuntCommentEvent> = {},
): NetHuntCommentEvent {
  return {
    id: '5f8a2b1c3d4e5f6a7b8c9d0e',
    time: 1742292000000,
    timeISO: '2025-03-18T10:00:00.000Z',
    pinned: false,
    origin: 'MANUALLY',
    creator: { name: 'Jane Doe', email: 'jane@acme.com' },
    type: 'comment',
    text: 'placeholder comment text', // no documented example; see header
    ...overrides,
  }
}
