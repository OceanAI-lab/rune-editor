// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createBlockSpec, createBlockExtension, readBlockInputText } from "../../schema"
import { nearestBodyBlock } from "../../schema/bodySurface"
import { insertOrUpdateBlockForSlashMenu } from "../../extensions/suggestion-menus"
import type { RuneBlockBase } from "../../types"

export interface RuneCodeBlock extends RuneBlockBase {
  type: "codeBlock"
  text: string
  language: string | null
}

export const CodeBlock = createBlockSpec({
  type: "codeBlock",
  content: "text*",
  meta: { code: true },
  indent: { mode: "numeric", maxDepth: 0 },
  schemaContext: {
    input: {
      examples: [
        { type: "codeBlock", text: "console.log(1)", language: "javascript" },
      ],
    },
  },
  props: {
    language: {
      default: null as string | null,
      parseHTML: (el) => {
        const code = el.querySelector("code")
        if (!code) return null
        const cls = code.getAttribute("class") ?? ""
        const m = cls.match(/language-([\w-]+)/)
        return m?.[1] ?? null
      },
      renderHTML: () => ({}),
    },
  },
  toRuneBlock: (node) => ({
    type: "codeBlock",
    id: typeof node.attrs.id === "string" ? node.attrs.id : "",
    depth: typeof node.attrs.depth === "number" ? node.attrs.depth : 0,
    text: node.textContent,
    language: typeof node.attrs.language === "string" ? node.attrs.language : null,
  }),
  fromInput: ({ schema, input, defaults }) => {
    const t = schema.nodes["codeBlock"]
    if (!t) return null
    const text = readBlockInputText(input)
    const language = typeof input.language === "string" ? input.language : null
    const attrs = {
      ...defaults.attrs,
      id: input.id ?? null,
      depth: input.depth ?? defaults.depth,
      language,
    }
    const content =
      defaults.preserveContent && defaults.content && t.validContent(defaults.content)
        ? defaults.content
        : text ? schema.text(text) : undefined
    return t.create(attrs, content, defaults.marks)
  },
  parseDOM: [
    {
      tag: "pre",
      preserveWhitespace: "full",
    },
  ],
  renderDOM: ({ node, HTMLAttributes }) => {
    const language = node.attrs.language as string | null
    const codeAttrs = language ? { class: `language-${language}` } : {}
    return [
      "div",
      { ...HTMLAttributes, class: "rune-block" },
      ["div", { class: "rune-block-content" },
        ["pre", {},
          ["code", codeAttrs, 0]]],
    ]
  },
  toMarkdown({ prefix, node }) {
    const lang = typeof node.attrs.language === "string" ? node.attrs.language : ""
    const text = node.textContent
    const indentedText = text.split("\n").map((line) => `${prefix}${line}`).join("\n")
    return {
      line: `${prefix}\`\`\`${lang}\n${indentedText}\n${prefix}\`\`\``,
      spacing: "isolated",
    }
  },
  clipboardRenderDOM: ({ node }) => {
    const language = node.attrs.language as string | null
    const codeAttrs = language ? { class: `language-${language}` } : {}
    return ["pre", {}, ["code", codeAttrs, 0]]
  },
  slashMenuItems: () => {
    const block = { type: "codeBlock" }
    return [
      {
        key: "codeBlock",
        title: "Code",
        aliases: ["code", "```"],
        group: "Basic blocks",
        block,
        onItemClick: (ctx) => insertOrUpdateBlockForSlashMenu(ctx, block),
      },
    ]
  },
  sideMenu: { draggable: true },
  extensions: [
    createBlockExtension({
      key: "input-rule",
      inputRules: [
        {
          find: /^```([\w-]+)?\s$/,
          replace: ({ match }) => ({
            type: "codeBlock",
            props: { language: match[1] ?? null },
          }),
        },
      ],
    }),
    createBlockExtension({
      key: "codeblock-keys",
      priority: 1100,
      keyboardShortcuts: {
        Enter: ({ editor }) => {
          const { state } = editor
          const { $from } = state.selection
          if ($from.depth < 1) return false
          if (nearestBodyBlock(editor, $from)?.node.type.name !== "codeBlock") return false
          return editor.commands.insertContent("\n")
        },
        Tab: ({ editor }) => {
          const { state } = editor
          const { $from } = state.selection
          if ($from.depth < 1) return false
          if (nearestBodyBlock(editor, $from)?.node.type.name !== "codeBlock") return false
          return editor.commands.insertContent("  ")
        },
        "Shift-Tab": ({ editor }) => {
          const { state } = editor
          const { $from } = state.selection
          if ($from.depth < 1) return false
          if (nearestBodyBlock(editor, $from)?.node.type.name !== "codeBlock") return false
          return true
        },
        Backspace: ({ editor }) => {
          const { state } = editor
          const { $from } = state.selection
          if ($from.depth < 1) return false
          if ($from.parentOffset !== 0) return false
          const block = nearestBodyBlock(editor, $from)?.node
          if (block?.type.name !== "codeBlock") return false
          if (block.content.size > 0) return false
          const id = block.attrs.id as string | undefined
          if (!id) return false
          return editor.commands.updateBlock(id, { type: "paragraph" })
        },
      },
    }),
  ],
})
