/**
 * Fibery entity → Task, from the documented fields only.
 *
 * The fixture is the Curtly Ambrose entity returned by the create example in
 * Create and update entities
 * (https://developers.fibery.com/guides/http-api/create-update-entities): its
 * system fields are `fibery/id`, `fibery/public-id`, `fibery/creation-date`,
 * `fibery/modification-date` and `fibery/created-by: { fibery/id }`, the same
 * system fields Query Entities returns
 * (https://developers.fibery.com/guides/http-api/query-entities), plus the
 * database's title Field `Cricket/Name` (the one whose meta has `ui/title?`,
 * per https://developers.fibery.com/guides/http-api/databases).
 *
 * The `assignments/assignees` value is not in that response: it is added here
 * in the subselect shape Query Entities documents for a collection
 * (`{"q/select": ["fibery/id"], ...}` gives `[{ "fibery/id": ... }]`), with the
 * user ids of the Response envelope example
 * (https://developers.fibery.com/api-reference/response-envelope) and of this
 * entity's `fibery/created-by`, because the Cricket Player has no assignees
 * Field.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawFiberyEntity,
} from '../../../../../../../src/verticals/projects/adapters/fibery/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

const FIELDS = { titleField: 'Cricket/Name', assigneesField: 'assignments/assignees' }

const documented: RawFiberyEntity = {
  'Cricket/Height': '2.01',
  'fibery/modification-date': '2019-06-27T10:44:53.860Z',
  'Cricket/Born': '1963-09-21',
  'fibery/id': 'd17390c4-98c8-11e9-a2a3-2a2ae2dbcce4',
  'fibery/creation-date': '2019-06-27T10:44:53.860Z',
  'fibery/created-by': { 'fibery/id': 'fe1db100-3779-11e9-9162-04d77e8d50cb' },
  'fibery/rank': 5674304923033269,
  'Cricket/Shirt Number': 1,
  'Cricket/Name': 'Curtly Ambrose',
  'fibery/public-id': '6',
  'assignments/assignees': [
    { 'fibery/id': '7dcf4730-82d2-11e9-8a28-82a9c787ee9d' },
    { 'fibery/id': 'fe1db100-3779-11e9-9162-04d77e8d50cb' },
  ],
}

describe('fibery transformTask', () => {
  it('parses with TaskSchema from the documented example', () => {
    const task = TaskSchema.parse(transformTask(documented, 'type-1', FIELDS))
    expect(task).toMatchObject({
      id: 'd17390c4-98c8-11e9-a2a3-2a2ae2dbcce4',
      externalId: 'd17390c4-98c8-11e9-a2a3-2a2ae2dbcce4',
      projectId: 'type-1',
      title: 'Curtly Ambrose',
      createdAt: '2019-06-27T10:44:53.860Z',
      updatedAt: '2019-06-27T10:44:53.860Z',
      assigneeIds: ['7dcf4730-82d2-11e9-8a28-82a9c787ee9d', 'fe1db100-3779-11e9-9162-04d77e8d50cb'],
      tagIds: [],
      platform: 'fibery',
    })
    expect(task.metadata).toEqual({
      publicId: '6',
      createdById: 'fe1db100-3779-11e9-9162-04d77e8d50cb',
    })
  })

  it('reads createdAt from fibery/creation-date and updatedAt from fibery/modification-date', () => {
    // Webhooks (https://developers.fibery.com/guides/http-api/webhooks): the
    // same entity after its update carries "fibery/modification-date":
    // "2019-07-30T07:18:48.449Z", while its creation date is unchanged.
    const updated = { ...documented, 'fibery/modification-date': '2019-07-30T07:18:48.449Z' }
    const task = TaskSchema.parse(transformTask(updated, 'type-1', FIELDS))
    expect(task.createdAt).toBe('2019-06-27T10:44:53.860Z')
    expect(task.updatedAt).toBe('2019-07-30T07:18:48.449Z')
  })

  it('reads the title from the database title Field only', () => {
    const task = transformTask(
      { ...documented, 'Cricket/Name': 'Only this', 'Cricket/Title': 'not this' },
      'type-1',
      FIELDS,
    )
    expect(task.title).toBe('Only this')
  })

  it('an empty (null) title stays empty rather than borrowing another field', () => {
    const task = TaskSchema.parse(
      transformTask({ ...documented, 'Cricket/Name': null }, 'type-1', FIELDS),
    )
    expect(task.title).toBe('')
  })

  it('reports status unknown: the docs document no workflow state field for entity queries', () => {
    const task = TaskSchema.parse(
      transformTask(
        { ...documented, 'Cricket/State': { 'fibery/name': 'Done' } },
        'type-1',
        FIELDS,
      ),
    )
    expect(task.status).toBe('unknown')
  })

  it('reads no undocumented priority, due date or parent', () => {
    const task = transformTask(
      {
        ...documented,
        'Cricket/Priority': { 'fibery/name': 'High' },
        'Cricket/Due-Date': '2026-04-01T00:00:00.000Z',
        'Cricket/Parent': { 'fibery/id': 'p-1' },
      },
      'type-1',
      FIELDS,
    )
    expect(task.priority).toBeUndefined()
    expect(task.dueDate).toBeUndefined()
    expect(task.parentId).toBeUndefined()
  })

  it('an empty assignee collection comes back as null ("empty collections are returned as nulls")', () => {
    const task = TaskSchema.parse(
      transformTask({ ...documented, 'assignments/assignees': null }, 'type-1', FIELDS),
    )
    expect(task.assigneeIds).toEqual([])
  })

  it('a database without the assignees Field has no assignees', () => {
    const task = TaskSchema.parse(
      transformTask(documented, 'type-1', { titleField: 'Cricket/Name' }),
    )
    expect(task.assigneeIds).toEqual([])
  })

  it('keeps the raw entity', () => {
    expect(transformTask(documented, 'type-1', FIELDS).raw).toBe(documented)
  })
})
