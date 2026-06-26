// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension, type Attributes, type CommandProps } from "@tiptap/core"
import {
  nearestColorName,
  normalizeAttrValue,
  type ColorName,
} from "../../shared/color-tokens"

export type ColorKind = "text" | "background"
export type ColorScope = "block" | "inline"

export interface ColorExtensionOptions {
  types: string[]
}

interface CreateColorExtensionConfig {
  kind: ColorKind
  scope: ColorScope
}

type ColorAttribute = "textColor" | "backgroundColor"
type ColorDataAttribute = "data-text-color" | "data-background-color"
type ColorStyleProperty = "color" | "backgroundColor"

const COLOR_ATTRIBUTES = {
  text: {
    attr: "textColor",
    dataAttr: "data-text-color",
    styleProp: "color",
  },
  background: {
    attr: "backgroundColor",
    dataAttr: "data-background-color",
    styleProp: "backgroundColor",
  },
} satisfies Record<
  ColorKind,
  {
    attr: ColorAttribute
    dataAttr: ColorDataAttribute
    styleProp: ColorStyleProperty
  }
>

const EXTENSION_NAMES = {
  block: {
    text: "runeBlockTextColor",
    background: "runeBlockBackgroundColor",
  },
  inline: {
    text: "runeTextColor",
    background: "runeBackgroundColor",
  },
} satisfies Record<ColorScope, Record<ColorKind, string>>

const DEFAULT_TYPES = {
  block: ["paragraph", "heading"],
  inline: ["textStyle"],
} satisfies Record<ColorScope, string[]>

const storedColor = (name: ColorName | null) =>
  name === "default" ? null : name

function createBlockColorAttribute(kind: ColorKind): Attributes[string] {
  const { attr, dataAttr, styleProp } = COLOR_ATTRIBUTES[kind]

  return {
    default: null,
    keepOnSplit: false,
    parseHTML: (element) => {
      // The color data-attr rides on `.rune-block-content`. Most blocks'
      // parse rules match an element AT or BELOW that wrapper (e.g. <p>),
      // so `closest` walks up to it. Blocks whose rule matches the OUTER
      // `.rune-block` instead (callout — its rule keys on the icon attr that
      // lives on the outer div) need a downward fallback to the direct-child
      // wrapper; `:scope >` keeps it from reaching into a nested block.
      const wrapper =
        element.closest(".rune-block-content") ??
        element.querySelector(":scope > .rune-block-content")
      const raw =
        wrapper?.getAttribute(dataAttr) ??
        element.getAttribute(dataAttr) ??
        element.style?.[styleProp] ??
        null
      return normalizeAttrValue(raw, kind)
    },
    renderHTML: (attrs) => {
      const value = attrs[attr]
      return typeof value === "string" ? { [dataAttr]: value } : {}
    },
  }
}

function createInlineColorAttribute(kind: ColorKind): Attributes[string] {
  const { attr, dataAttr, styleProp } = COLOR_ATTRIBUTES[kind]

  return {
    default: null,
    parseHTML: (element) => {
      const dataAttrValue = element.getAttribute(dataAttr)
      if (dataAttrValue) return normalizeAttrValue(dataAttrValue, kind)

      const inline = element.style?.[styleProp]
      if (inline) return nearestColorName(inline, kind)

      return null
    },
    renderHTML: (attrs) => {
      const value = attrs[attr]
      return typeof value === "string" ? { [dataAttr]: value } : {}
    },
  }
}

function setBlockColor(
  attr: ColorAttribute,
  pos: number,
  name: ColorName | null,
  { tr, state, dispatch }: CommandProps,
) {
  const node = state.doc.nodeAt(pos)
  if (!node) return false

  if (dispatch) {
    tr.setNodeAttribute(pos, attr, storedColor(name))
    dispatch(tr)
  }

  return true
}

function setInlineColor(
  attr: ColorAttribute,
  name: ColorName,
  { chain }: CommandProps,
) {
  const value = storedColor(name)
  const next = chain().setMark("textStyle", { [attr]: value })
  return (value === null ? next.command(pruneEmptyTextStyleMarks) : next).run()
}

function unsetInlineColor(attr: ColorAttribute, { chain }: CommandProps) {
  return chain()
    .setMark("textStyle", { [attr]: null })
    .command(pruneEmptyTextStyleMarks)
    .run()
}

function pruneEmptyTextStyleMarks({ tr, state }: CommandProps) {
  const markType = state.schema.marks["textStyle"]
  if (!markType) return false

  const { from, to } = tr.selection
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true

    const mark = node.marks.find((candidate) => candidate.type === markType)
    if (mark && !Object.values(mark.attrs).some(Boolean)) {
      tr.removeMark(pos, pos + node.nodeSize, mark)
    }
    return false
  })

  return true
}

export function createColorExtension({
  kind,
  scope,
}: CreateColorExtensionConfig) {
  const { attr } = COLOR_ATTRIBUTES[kind]

  return Extension.create<ColorExtensionOptions>({
    name: EXTENSION_NAMES[scope][kind],

    addOptions() {
      return { types: [...DEFAULT_TYPES[scope]] }
    },

    addGlobalAttributes() {
      return [
        {
          types: this.options.types,
          attributes: {
            [attr]:
              scope === "block"
                ? createBlockColorAttribute(kind)
                : createInlineColorAttribute(kind),
          },
        },
      ]
    },

    addCommands() {
      if (scope === "block" && kind === "text") {
        return {
          setBlockTextColor:
            (pos: number, name: ColorName | null) =>
            (props: CommandProps) =>
              setBlockColor(attr, pos, name, props),
        }
      }

      if (scope === "block" && kind === "background") {
        return {
          setBlockBackgroundColor:
            (pos: number, name: ColorName | null) =>
            (props: CommandProps) =>
              setBlockColor(attr, pos, name, props),
        }
      }

      if (scope === "inline" && kind === "text") {
        return {
          setRuneTextColor:
            (name: ColorName) =>
            (props: CommandProps) =>
              setInlineColor(attr, name, props),
          unsetRuneTextColor:
            () =>
            (props: CommandProps) =>
              unsetInlineColor(attr, props),
        }
      }

      return {
        setRuneBackgroundColor:
          (name: ColorName) =>
          (props: CommandProps) =>
            setInlineColor(attr, name, props),
        unsetRuneBackgroundColor:
          () =>
          (props: CommandProps) =>
            unsetInlineColor(attr, props),
      }
    },
  })
}
