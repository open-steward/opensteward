import path from 'node:path'

const here = __dirname

export const designSystemRoot = path.resolve(here, '..')
export const tokensCss = path.join(designSystemRoot, 'tokens.css')
export const baseCss = path.join(designSystemRoot, 'base.css')
export const componentsCss = path.join(designSystemRoot, 'components.css')
export const swaggerThemeCss = path.join(designSystemRoot, 'swagger-theme.css')
export const fontsDir = path.join(designSystemRoot, 'fonts')
export const logoDir = path.join(designSystemRoot, 'logo')
export const iconsDir = path.join(designSystemRoot, 'icons')
export const verticalIconsDir = path.join(designSystemRoot, 'icons', 'verticals')
