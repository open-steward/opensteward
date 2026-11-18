import { describe, it, expect } from 'vitest'
import {
  transformCategoria,
  type RawLojaIntegradaCategoria,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/categoria'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'
import { CATEGORIA_LIST_OBJECTS } from '../fixtures'

const [top, sub] = CATEGORIA_LIST_OBJECTS as RawLojaIntegradaCategoria[]

describe('transformCategoria (loja-integrada)', () => {
  it('maps a documented GET /v1/categoria row to a valid Collection', () => {
    const c = CollectionSchema.parse(transformCategoria(top!))
    expect(c).toMatchObject({
      id: '7645875',
      title: 'Feminino',
      description: 'Looks para mulheres modernas.',
    })
    expect(c.handle).toBeUndefined()
    expect(c.metadata).toMatchObject({ url: 'http://www.testeli.tk/feminino' })
  })

  it('omits an empty descricao and keeps the parent link in metadata', () => {
    const c = CollectionSchema.parse(transformCategoria(sub!))
    expect(c.description).toBeUndefined()
    expect(c.metadata).toMatchObject({ categoria_pai: '/api/v1/categoria/7645875' })
  })

  it('throws on a category with no nome', () => {
    expect(() => transformCategoria({ ...top!, nome: null })).toThrow(/no nome/)
  })
})
