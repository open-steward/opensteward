/** res.company rows; fields from odoo/addons/base/models/res_company.py, 19.0 and 14.0. */
import { describe, expect, it } from 'vitest'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'
import { transformWorkspace } from '../../../../../../../src/verticals/projects/adapters/odoo-project/transform/workspace'

describe('odoo-project transformWorkspace', () => {
  it('maps a company', () => {
    const w = WorkspaceSchema.parse(
      transformWorkspace({ id: 2, name: 'My Company (Chicago)', parent_id: [1, 'YourCompany'] }),
    )
    expect(w).toMatchObject({
      id: '2',
      externalId: '2',
      name: 'My Company (Chicago)',
      platform: 'odoo-project',
    })
    expect(w.memberCount).toBeUndefined()
    expect(w.metadata).toEqual({ parentCompanyId: '1' })
  })

  it('a top-level company has no parent', () => {
    const w = WorkspaceSchema.parse(
      transformWorkspace({ id: 1, name: 'YourCompany', parent_id: false }),
    )
    expect(w.metadata).toEqual({})
    expect(WorkspaceSchema.parse(transformWorkspace({ id: 3 })).name).toBe('')
  })
})
