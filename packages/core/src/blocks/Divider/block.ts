// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import { Selection, TextSelection } from "@tiptap/pm/state"

import { createBlockExtension, createBlockSpec } from "../../schema"
import { nearestBodyBlock } from "../../schema/bodySurface"
import type { RuneBlockBase } from "../../types"
import { insertOrUpdateBlockForSlashMenu } from "../../extensions/suggestion-menus"

function moveAcrossDividerRun({
  editor,
  direction,
}: {
  editor: Editor
  direction: "previous" | "next"
}): boolean {
  const { state, view } = editor
  const { selection } = state
  if (!selection.empty) return false

  const $from = state.doc.resolve(selection.from)
  if ($from.depth < 1) return false
  const nearest = nearestBodyBlock(editor, $from)
  if (!nearest) return false

  if (direction === "next") {
    let blockEnd = nearest.pos + nearest.node.nodeSize
    if (blockEnd >= state.doc.content.size) return false

    const next = state.doc.nodeAt(blockEnd)
    if (!next || next.type.name !== "divider") return false

    while (blockEnd < state.doc.content.size) {
      const node = state.doc.nodeAt(blockEnd)
      if (!node || node.type.name !== "divider") break
      blockEnd += node.nodeSize
    }

    if (blockEnd >= state.doc.content.size) return true

    const target = state.doc.nodeAt(blockEnd)
    if (!target) return true

    // Target is the first non-divider block past the run. If it's a
    // textblock, drop the cursor at its content start; otherwise let
    // Selection.near pick the most reasonable spot (NodeSelection for
    // atoms, recurse-into for non-atom containers). Without this, any
    // non-textblock neighbour would swallow the keypress and trap the
    // caret. See #130.
    const landing = target.isTextblock
      ? TextSelection.create(state.doc, blockEnd + 1)
      : Selection.near(state.doc.resolve(blockEnd), 1)
    view.dispatch(state.tr.setSelection(landing))
    return true
  }

  if (direction === "previous") {
    let blockStart = nearest.pos
    if (blockStart <= 0) return false

    const $prev = state.doc.resolve(blockStart)
    const prev = $prev.nodeBefore
    if (!prev || prev.type.name !== "divider") return false

    while (blockStart > 0) {
      const node = state.doc.resolve(blockStart).nodeBefore
      if (!node || node.type.name !== "divider") break
      blockStart -= node.nodeSize
    }

    if (blockStart <= 0) return true

    const target = state.doc.resolve(blockStart).nodeBefore
    if (!target) return true

    // Mirror of the `next` branch — see comment there. Bias=-1 makes
    // Selection.near scan backward, so a non-textblock atom resolves
    // to a NodeSelection on it instead of trapping the caret.
    const landing = target.isTextblock
      ? TextSelection.create(state.doc, blockStart - 1)
      : Selection.near(state.doc.resolve(blockStart), -1)
    view.dispatch(state.tr.setSelection(landing))
    return true
  }

  return false
}

function skipDividerOnArrowDown({ editor }: { editor: Editor }): boolean {
  const { state, view } = editor
  if (!state.selection.empty) return false
  if (!view.endOfTextblock("down")) return false
  return moveAcrossDividerRun({ editor, direction: "next" })
}

function skipDividerOnArrowUp({ editor }: { editor: Editor }): boolean {
  const { state, view } = editor
  if (!state.selection.empty) return false
  if (!view.endOfTextblock("up")) return false
  return moveAcrossDividerRun({ editor, direction: "previous" })
}

function skipDividerOnArrowLeft({ editor }: { editor: Editor }): boolean {
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return false

  const $from = state.doc.resolve(selection.from)
  if ($from.parentOffset !== 0) return false
  return moveAcrossDividerRun({ editor, direction: "previous" })
}

function skipDividerOnArrowRight({ editor }: { editor: Editor }): boolean {
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return false

  const $from = state.doc.resolve(selection.from)
  if ($from.parentOffset !== $from.parent.content.size) return false
  return moveAcrossDividerRun({ editor, direction: "next" })
}

function preserveDividerOnBackspace({ editor }: { editor: Editor }): boolean {
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return false

  const $from = state.doc.resolve(selection.from)
  if ($from.parentOffset !== 0) return false
  return moveAcrossDividerRun({ editor, direction: "previous" })
}

function preserveDividerOnDelete({ editor }: { editor: Editor }): boolean {
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return false

  const $from = state.doc.resolve(selection.from)
  if ($from.parentOffset !== $from.parent.content.size) return false
  return moveAcrossDividerRun({ editor, direction: "next" })
}

/**
 * Divider — atom block, no content. Renders as `.rune-block > hr`. The
 * outer wrapper is mandatory: `.rune-block` is load-bearing for side-menu
 * hit-testing, MBS marquee, drag preview, and depth-based indent. The
 * inner `<hr>` is the painted line.
 *
 * Clipboard text/html emits a bare `<hr>` so external paste targets
 * (TextEdit, GitHub README, Notion) get a clean horizontal rule.
 */
export const Divider = createBlockSpec({
  type: "divider",
  content: "",
  indent: { mode: "numeric", maxDepth: 0 },
  meta: { defining: false },
  schemaContext: {
    input: {
      examples: [{ type: "divider" }],
    },
  },
  toRuneBlock: (node) => ({
    type: "divider",
    id: typeof node.attrs.id === "string" ? node.attrs.id : "",
    depth: typeof node.attrs.depth === "number" ? node.attrs.depth : 0,
  }),
  fromInput: ({ schema, input, defaults }) => {
    const t = schema.nodes["divider"]
    if (!t) return null
    return t.create({
      ...defaults.attrs,
      id: input.id ?? null,
      depth: input.depth ?? defaults.depth,
    })
  },
  parseDOM: [{ tag: "hr" }],
  renderDOM: ({ HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, class: "rune-block" },
    ["hr"],
  ],
  toMarkdown({ prefix }) {
    return { line: `${prefix}---`, spacing: "isolated" }
  },
  clipboardRenderDOM: () => ["hr"],
  slashMenuItems: () => {
    const block = { type: "divider" }
    return [
      {
        key: "divider",
        title: "Divider",
        aliases: ["hr", "horizontal rule", "line", "---"],
        group: "Basic blocks",
        block,
        onItemClick: (ctx) => insertOrUpdateBlockForSlashMenu(ctx, block),
      },
    ]
  },
  sideMenu: { draggable: true },
  extensions: [
    createBlockExtension({
      key: "keyboard",
      keyboardShortcuts: {
        ArrowDown: skipDividerOnArrowDown,
        ArrowUp: skipDividerOnArrowUp,
        ArrowLeft: skipDividerOnArrowLeft,
        ArrowRight: skipDividerOnArrowRight,
        Backspace: preserveDividerOnBackspace,
        Delete: preserveDividerOnDelete,
      },
    }),
    createBlockExtension({
      key: "input-rule",
      inputRules: [
        {
          find: /^---\s$/,
          replace: () => ({ type: "divider" }),
        },
      ],
    }),
  ],
})

export interface RuneDividerBlock extends RuneBlockBase {
  type: "divider"
}
