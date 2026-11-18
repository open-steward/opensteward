import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawProjectplaceComment,
} from '../../../../../../../src/verticals/projects/adapters/projectplace/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('projectplace transformComment', () => {
  // create_time as Unix epoch seconds
  const raw: RawProjectplaceComment = {
    id: 9001,
    text: 'Card is ready for review.',
    creator: { id: 12, name: 'Grace Hopper' },
    create_time: 1746057600, // 2025-05-01T00:00:00.000Z
    modify_time: 1746144000, // 2025-05-02T00:00:00.000Z
    item_id: 555,
    item_name: 'card',
    attachments: [{}, {}],
  }

  it('maps id as string', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('9001')
    expect(result.externalId).toBe('9001')
  })

  it('maps body from text field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Card is ready for review.')
  })

  it('falls back to encoded_text when text is absent', () => {
    const encoded: RawProjectplaceComment = {
      id: 2,
      encoded_text: 'encoded body',
      create_time: 1746057600,
    }
    const result = transformComment(encoded)
    expect(result.body).toBe('encoded body')
  })

  it('maps authorId from creator.id as string', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('12')
  })

  it('falls back to creator_id when creator object is absent', () => {
    const noCreator: RawProjectplaceComment = { id: 3, creator_id: 99, create_time: 1 }
    const result = transformComment(noCreator)
    expect(result.authorId).toBe('99')
  })

  it('taskId resolved from item_id when item_name is card', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('555')
  })

  it('taskId from argument overrides item_id', () => {
    const result = transformComment(raw, 'card-arg')
    expect(result.taskId).toBe('card-arg')
  })

  it('taskId is undefined when item_name is not card', () => {
    const notCard: RawProjectplaceComment = {
      id: 4,
      item_id: 10,
      item_name: 'planlet',
      create_time: 1,
    }
    const result = transformComment(notCard)
    expect(result.taskId).toBeUndefined()
  })

  it('createdAt converts epoch seconds to ISO', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe(new Date(1746057600 * 1000).toISOString())
  })

  it('updatedAt converts epoch seconds to ISO', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBe(new Date(1746144000 * 1000).toISOString())
  })

  it('attachmentCount reflects attachments array length', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(2)
  })

  it('platform is projectplace', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('projectplace')
  })

  it('metadata includes itemName', () => {
    const result = transformComment(raw)
    expect(result.metadata.itemName).toBe('card')
  })

  it('createdAt falls back to epoch when create_time absent', () => {
    const minimal: RawProjectplaceComment = { id: 5 }
    const result = transformComment(minimal)
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'card-99')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
