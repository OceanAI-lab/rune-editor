// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createBlockSpec, readBlockInputText, inlineContentFromText } from "../../schema"
import type { RuneBlockBase } from "../../types"
import { insertOrUpdateBlockForSlashMenu } from "../../extensions/suggestion-menus"

// Notion ships a 💡 as the default callout emoji; mirror it so a fresh
// callout looks identical out of the box. Stored as a per-block `icon`
// prop (data-rune-callout-icon) so it round-trips through getHTML and can
// later be changed via updateBlock without touching the schema.
const DEFAULT_CALLOUT_ICON = "💡"

const normalizeIcon = (value: unknown): string =>
  typeof value === "string" && value.length > 0 ? value : DEFAULT_CALLOUT_ICON

export interface RuneCalloutBlock extends RuneBlockBase {
  type: "callout"
  icon: string
  text: string
}

export const Callout = createBlockSpec({
  type: "callout",
  content: "inline*",
  // The colored box is `.rune-block-content`, so the side-menu background
  // palette (data-background-color rides there) tints the box and flips
  // light/dark for free — Notion's callout colors ARE just bg colors.
  supports: { textColor: true, backgroundColor: true },
  schemaContext: {
    input: {
      examples: [{ type: "callout", icon: "💡", text: "Callout text" }],
    },
  },
  props: {
    icon: {
      default: DEFAULT_CALLOUT_ICON,
      parseHTML: (el) => normalizeIcon(el.getAttribute("data-rune-callout-icon")),
      renderHTML: (a) => ({ "data-rune-callout-icon": normalizeIcon(a.icon) }),
    },
  },
  toRuneBlock: (node) => ({
    type: "callout",
    id: typeof node.attrs.id === "string" ? node.attrs.id : "",
    depth: typeof node.attrs.depth === "number" ? node.attrs.depth : 0,
    icon: normalizeIcon(node.attrs.icon),
    text: node.textContent,
  }),
  fromInput: ({ schema, input, defaults }) => {
    const t = schema.nodes["callout"]
    if (!t) return null
    const text = readBlockInputText(input)
    const attrs = {
      ...defaults.attrs,
      id: input.id ?? null,
      depth: input.depth ?? defaults.depth,
      icon: normalizeIcon((input as { icon?: unknown }).icon),
    }
    const content =
      defaults.preserveContent && defaults.content && t.validContent(defaults.content)
        ? defaults.content
        : text
          ? inlineContentFromText(schema, text)
          : undefined
    return t.create(attrs, content, defaults.marks)
  },
  parseDOM: [
    // Round-trip rune's own getHTML output: the outer `.rune-block` carries
    // data-rune-callout-icon (from the prop renderHTML). contentElement
    // points PM at the inner `.rune-callout-content` so the inline text is
    // taken from THERE — not from the emoji span sibling, which would
    // otherwise be slurped into the content.
    {
      tag: "div[data-rune-callout-icon]",
      priority: 60,
      contentElement: (node: globalThis.Node) => {
        const el = node as HTMLElement
        return (
          el.querySelector(":scope > .rune-block-content > .rune-callout-content") ?? el
        )
      },
    },
    // External clipboard / generic semantic callout: the <aside> emitted by
    // clipboardRenderDOM. Body text lives in the [data-rune-callout-body]
    // span; the leading emoji span is excluded via contentElement.
    {
      tag: "aside[data-rune-callout]",
      priority: 55,
      contentElement: (node: globalThis.Node) => {
        const el = node as HTMLElement
        return el.querySelector(":scope > [data-rune-callout-body]") ?? el
      },
    },
  ],
  renderDOM: ({ node, HTMLAttributes }) => {
    const icon = normalizeIcon(node.attrs.icon)
    const {
      "data-text-color": textColor,
      "data-background-color": bgColor,
      ...outer
    } = HTMLAttributes
    const contentAttrs: Record<string, string> = {
      class: "rune-block-content",
      role: "note",
    }
    if (textColor) contentAttrs["data-text-color"] = textColor
    if (bgColor) contentAttrs["data-background-color"] = bgColor
    return [
      "div",
      { ...outer, class: "rune-block rune-callout" },
      [
        "div",
        contentAttrs,
        [
          "span",
          {
            class: "rune-callout-icon",
            contenteditable: "false",
            "aria-hidden": "true",
          },
          icon,
        ],
        ["div", { class: "rune-callout-content" }, 0],
      ],
    ]
  },
  toMarkdown({ prefix, serializeInline, node }) {
    return { line: `${prefix}> ${normalizeIcon(node.attrs.icon)} ${serializeInline(node)}` }
  },
  clipboardRenderDOM: ({ node }) => {
    const icon = normalizeIcon(node.attrs.icon)
    // Chrome-free, semantic <aside> for external paste — no .rune-block /
    // data-id / data-depth. Emoji rides as a leading non-editable span so
    // TextEdit / Notion / GitHub show "💡 text"; the body span carries the
    // inline content for a clean round-trip back into rune. NBSP keeps the
    // emoji glued to the first word.
    return [
      "aside",
      { "data-rune-callout": "", "data-rune-callout-icon": icon },
      ["span", { "data-rune-callout-emoji": "", "aria-hidden": "true" }, `${icon} `],
      ["span", { "data-rune-callout-body": "" }, 0],
    ]
  },
  sideMenu: { draggable: true },
  slashMenuItems: () => {
    const block = { type: "callout" }
    return [
      {
        key: "callout",
        title: "Callout",
        aliases: ["callout", "note", "info", "tip", "aside"],
        group: "Basic blocks",
        block,
        onItemClick: (ctx) => insertOrUpdateBlockForSlashMenu(ctx, block),
      },
    ]
  },
})
