import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawPlanhatNote,
} from '../../../../../../../src/verticals/crm/adapters/planhat/transform/note'

// First record of the "Get conversations List" example response at
// https://www.planhat.com/developers/api/conversation (values verbatim).
const LISTED: RawPlanhatNote = {
  date: '2021-07-29T15:29:34.330Z',
  userIds: ['58e231b14246fc73139f29e8'],
  hasMore: false,
  isCustomType: false,
  subject: 'Chat with the client',
  snippet: 'Slack chat with the client.',
  _id: '6102e3b08084189dcbf0e3f0',
  type: 'note',
  tags: [],
  createDate: '2021-07-29T17:21:52.347Z',
  companyId: '61006bc89a3e0b702ed8ea49',
  companyName: 'Leo company',
  users: [{ id: '58e231b14246fc73139f29e8', name: 'Alex', isOwner: true }],
  endusers: [{ id: '610091916d643a7c418aef42', name: 'Lara Croft' }],
  assigneeName: '',
  activityTags: [],
  hasAttachments: false,
  isSeen: false,
  starred: false,
  pinned: false,
  archived: false,
}

describe('planhat transformNote', () => {
  it('parses the documented list example with the canonical schema', () => {
    const n = NoteSchema.parse(transformNote(LISTED))
    expect(n).toMatchObject({
      id: '6102e3b08084189dcbf0e3f0',
      company_id: '61006bc89a3e0b702ed8ea49',
      owner_id: '58e231b14246fc73139f29e8',
      created_at: '2021-07-29T17:21:52.347Z',
    })
  })

  it('maps content from the documented description', () => {
    expect(transformNote({ ...LISTED, description: 'A note' }).content).toBe('A note')
  })

  it('takes owner_id only from the user flagged isOwner', () => {
    const n = transformNote({
      ...LISTED,
      users: [
        { id: 'u-a', name: 'A', isOwner: false },
        { id: 'u-b', name: 'B', isOwner: true },
      ],
    })
    expect(n.owner_id).toBe('u-b')
    expect(
      transformNote({ ...LISTED, users: [{ id: 'u-a', isOwner: false }] }).owner_id,
    ).toBeUndefined()
  })

  it('does not read the undocumented enduserId, ownerId, createdAt or updatedAt', () => {
    const n = transformNote({
      _id: 'x',
      enduserId: 'eu-1',
      ownerId: 'o-1',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
    })
    expect(n.contact_id).toBeUndefined()
    expect(n.owner_id).toBeUndefined()
    expect(n.created_at).toBeUndefined()
    expect(n.updated_at).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    expect(transformNote(LISTED).metadata).toBe(LISTED)
  })
})

describe('planhat untransformNote', () => {
  it('maps content to description', () => {
    const result = untransformNote({ content: 'A note' })
    expect(result.description).toBe('A note')
  })
})
