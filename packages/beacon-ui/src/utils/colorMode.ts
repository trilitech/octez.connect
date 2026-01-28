import { ColorMode } from '@tezos-x/beacon-types'

let colorMode: ColorMode = ColorMode.LIGHT

export const setColorMode = (mode: ColorMode): void => {
  colorMode = mode
}

export const getColorMode = (): ColorMode => colorMode
