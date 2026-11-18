/**
 * Fibery Database → Project, from the documented schema fields only.
 *
 * The fixture is the Database in the Get Schema example response
 * (https://developers.fibery.com/guides/http-api/schema): `fibery/name` in
 * `${space}/${name}` format, `fibery/id`, `fibery/fields`, and `fibery/meta`
 * with `fibery/domain?` and `ui/color`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawFiberyType,
} from '../../../../../../../src/verticals/projects/adapters/fibery/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

const documented: RawFiberyType = {
  'fibery/name': 'software-development/user-story',
  'fibery/fields': [
    {
      'fibery/name': 'fibery/modification-date',
      'fibery/type': 'fibery/date-time',
      'fibery/meta': { 'fibery/modification-date?': true, 'fibery/readonly?': true },
      'fibery/id': 'e36a91b1-3f4b-11e9-8051-8fb5f642f8a5',
    },
    {
      'fibery/name': 'assignments/assignees',
      'fibery/type': 'fibery/user',
      'fibery/meta': { 'fibery/collection?': true },
      'fibery/id': '2cd92374-3839-11e9-9162-04d77e8d50cb',
    },
  ],
  'fibery/meta': {
    'fibery/primitive?': false,
    'fibery/domain?': true,
    'ui/color': '#068cba',
    'fibery/secured?': true,
  },
  'fibery/id': '2c4213ae-3839-11e9-9162-04d77e8d50cb',
}

const WORKSPACE = 'fd5d9550-3779-11e9-9162-04d77e8d50cb'

describe('fibery transformProject', () => {
  it('parses with ProjectSchema from the documented example', () => {
    const project = ProjectSchema.parse(transformProject(documented, WORKSPACE))
    expect(project).toMatchObject({
      id: '2c4213ae-3839-11e9-9162-04d77e8d50cb',
      externalId: '2c4213ae-3839-11e9-9162-04d77e8d50cb',
      workspaceId: WORKSPACE,
      name: 'user-story',
      platform: 'fibery',
    })
    expect(project.metadata).toEqual({
      dbName: 'software-development/user-story',
      spaceName: 'software-development',
      fieldCount: '2',
      color: '#068cba',
    })
  })

  it('reports status unknown: the schema documents no archived or status flag', () => {
    const project = transformProject(
      { ...documented, 'fibery/meta': { ...documented['fibery/meta'], archived: true } },
      WORKSPACE,
    )
    expect(project.status).toBe('unknown')
  })

  it('reads the color from ui/color only', () => {
    const project = transformProject(
      { ...documented, 'fibery/meta': { 'fibery/domain?': true, color: '#fff' } },
      WORKSPACE,
    )
    expect(project.metadata.color).toBeUndefined()
  })

  it('uses the whole name when it has no space part', () => {
    expect(transformProject({ ...documented, 'fibery/name': 'Tasks' }, WORKSPACE).name).toBe(
      'Tasks',
    )
  })

  it('keeps the raw database', () => {
    expect(transformProject(documented, WORKSPACE).raw).toBe(documented)
  })
})
