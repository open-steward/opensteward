import { describe, it, expect } from 'vitest'
import { transformCollection } from '../../../../../../../src/verticals/ecommerce/adapters/sana-commerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection', () => {
  it('maps Id to id (stringified) and Title to title', () => {
    const result = transformCollection({ Id: 10, Title: 'Electronics' })
    expect(result.id).toBe('10')
    expect(result.title).toBe('Electronics')
  })

  it('maps camelCase id and title', () => {
    const result = transformCollection({ id: 'cat-99', title: 'Furniture' })
    expect(result.id).toBe('cat-99')
    expect(result.title).toBe('Furniture')
  })

  it('falls back to Name for title when Title is absent', () => {
    const result = transformCollection({ Id: '1', Name: 'Apparel' })
    expect(result.title).toBe('Apparel')
    expect(result.id).toBe('1')
  })

  it('falls back to camelCase name for title', () => {
    const result = transformCollection({ Id: '2', name: 'footwear' })
    expect(result.title).toBe('footwear')
    expect(result.id).toBe('2')
  })

  it('maps UrlName to handle (must be slug-compatible)', () => {
    const result = transformCollection({
      Id: '3',
      Title: 'My Category',
      UrlName: 'my-category-slug',
    })
    expect(result.handle).toBe('my-category-slug')
    expect(result.title).toBe('My Category')
  })

  it('maps camelCase urlName to handle', () => {
    const result = transformCollection({ Id: '4', Title: 'Home', urlName: 'home-goods' })
    expect(result.handle).toBe('home-goods')
    expect(result.id).toBe('4')
  })

  it('omits handle when UrlName is absent', () => {
    const result = transformCollection({ Id: '5', Title: 'No Handle' })
    expect(result.handle).toBeUndefined()
    expect(result.title).toBe('No Handle')
  })

  it('always sets type to MANUAL', () => {
    const result1 = transformCollection({ Id: '6', Title: 'A' })
    expect(result1.type).toBe('MANUAL')

    const result2 = transformCollection({ Id: '7', Title: 'B', UrlName: 'b-cat' })
    expect(result2.type).toBe('MANUAL')
  })

  it('maps ImageUrl to image.url', () => {
    const result = transformCollection({
      Id: '8',
      Title: 'Visual Category',
      ImageUrl: 'https://example.com/cat.jpg',
    })
    expect(result.image?.url).toBe('https://example.com/cat.jpg')
    expect(result.id).toBe('8')
  })

  it('maps camelCase imageUrl to image.url', () => {
    const result = transformCollection({
      Id: '9',
      Title: 'Camel Image',
      imageUrl: 'https://cdn.example.com/thumb.png',
    })
    expect(result.image?.url).toBe('https://cdn.example.com/thumb.png')
    expect(result.title).toBe('Camel Image')
  })

  it('omits image when ImageUrl is absent', () => {
    const result = transformCollection({ Id: '10', Title: 'No Image' })
    expect(result.image).toBeUndefined()
    expect(result.id).toBe('10')
  })

  it('maps Description to description', () => {
    const result = transformCollection({
      Id: '11',
      Title: 'Described',
      Description: 'A curated set of items.',
    })
    expect(result.description).toBe('A curated set of items.')
    expect(result.id).toBe('11')
  })

  it('maps camelCase description', () => {
    const result = transformCollection({
      Id: '12',
      Title: 'Camel Desc',
      description: 'Short blurb.',
    })
    expect(result.description).toBe('Short blurb.')
    expect(result.title).toBe('Camel Desc')
  })

  it('numeric Id is stringified', () => {
    const result = transformCollection({ Id: 999, Title: 'Numeric' })
    expect(result.id).toBe('999')
    expect(typeof result.id).toBe('string')
  })

  it('passes CollectionSchema.parse without throwing', () => {
    const result = transformCollection({
      Id: 'schema-col',
      Title: 'Schema Valid Collection',
      UrlName: 'schema-valid-collection',
      Description: 'Full schema test.',
      ImageUrl: 'https://example.com/schema.jpg',
    })
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('passes CollectionSchema.parse without throwing when optional fields are absent', () => {
    const result = transformCollection({ Id: 'minimal', Title: 'Minimal' })
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})
