import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawNiftyMessage,
} from '../../../../../../../src/verticals/projects/adapters/nifty/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

function makeMessage(overrides: Partial<RawNiftyMessage> = {}): RawNiftyMessage {
  return {
    id: 'msg-1',
    text: 'Hello team!',
    type: 'message',
    subtype: null,
    author: 'usr-jane',
    task: 'task-42',
    chat: null,
    thread: null,
    tagged: [],
    attachments: [],
    is_edited: false,
    created_at: '2024-03-01T10:00:00.000Z',
    updated_at: '2024-03-01T11:00:00.000Z',
    ...overrides,
  }
}

describe('nifty transformComment', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformComment(makeMessage())
    expect(result.id).toBe('msg-1')
    expect(result.externalId).toBe('msg-1')
  })

  it('maps taskId from raw.task when no explicit taskId arg', () => {
    const result = transformComment(makeMessage())
    expect(result.taskId).toBe('task-42')
  })

  it('prefers explicit taskId argument over raw.task', () => {
    const result = transformComment(makeMessage({ task: 'task-old' }), 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('maps authorId from raw.author', () => {
    const result = transformComment(makeMessage())
    expect(result.authorId).toBe('usr-jane')
  })

  it('maps body from raw.text', () => {
    const result = transformComment(makeMessage())
    expect(result.body).toBe('Hello team!')
  })

  it('maps mentions from raw.tagged array', () => {
    const result = transformComment(makeMessage({ tagged: ['usr-alice', 'usr-bob'] }))
    expect(result.mentions).toEqual(['usr-alice', 'usr-bob'])
  })

  it('filters non-string values from tagged', () => {
    const result = transformComment(
      makeMessage({ tagged: ['usr-alice', null as unknown as string] }),
    )
    expect(result.mentions).toEqual(['usr-alice'])
  })

  it('counts attachments from raw.attachments array', () => {
    const result = transformComment(makeMessage({ attachments: [{}, {}] }))
    expect(result.attachmentCount).toBe(2)
  })

  it('attachmentCount is 0 when attachments is null', () => {
    const result = transformComment(makeMessage({ attachments: null }))
    expect(result.attachmentCount).toBe(0)
  })

  it('maps createdAt from raw.created_at', () => {
    const result = transformComment(makeMessage())
    expect(result.createdAt).toBe('2024-03-01T10:00:00.000Z')
  })

  it('falls back to epoch when created_at is absent', () => {
    const result = transformComment(makeMessage({ created_at: null }))
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('maps updatedAt from raw.updated_at', () => {
    const result = transformComment(makeMessage())
    expect(result.updatedAt).toBe('2024-03-01T11:00:00.000Z')
  })

  it('platform is nifty', () => {
    const result = transformComment(makeMessage())
    expect(result.platform).toBe('nifty')
  })

  it('metadata.type reflects raw.type', () => {
    const result = transformComment(makeMessage({ type: 'file' }))
    expect(result.metadata.type).toBe('file')
  })

  it('passes CommentSchema.parse without throwing', () => {
    const result = transformComment(makeMessage())
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
