import { ColorMode } from '@tezos-x/octez.connect-types'

let colorMode: ColorMode = ColorMode.LIGHT

export const setColorMode = (mode: ColorMode): void => {
  colorMode = mode
}

export const getColorMode = (): ColorMode => colorMode
