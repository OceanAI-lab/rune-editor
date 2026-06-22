// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Fragment } from "@tiptap/pm/model"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { createBlockSpec } from "../../schema"
import type { RuneBlockBase } from "../../types"
import type { RuneBlock } from "../index"
import type { RuneBlockInput } from "../../api/types"
import { createNodeFromBlockInput, insertWouldNestColumnLayout } from "../../api/commands/insertBlocks"
import { insertOrUpdateBlockForSlashMenu } from "../../extensions/suggestion-menus"
import type { SuggestionCommitContext } from "../../extensions/suggestion-menus"
import { Column } from "./nodes"
import { ColumnsNormalization, normalizeColumnWidth } from "./normalization"
import { ColumnsKeyboard } from "./keyboard"
import { ColumnsResize } from "./resize"

// E1 default for the `/N columns` slash items: an N-column layout, each
// column seeded with one empty paragraph (E2 — a column always holds ≥1
// body block). Passed through the slash item's `block.props.columns`, which
// the slash-menu container path spreads into `fromInput`'s input as
// `input.columns`. Kept as a factory so each invocation builds a fresh,
// unshared array.
function defaultColumnsInput(count: number): { columns: { width: number; children: never[] }[] } {
  return {
    columns: Array.from({ length: count }, () => ({ width: 1, children: [] })),
  }
}

/**
 * Schema cap on `columnLayout` children — the upper bound of the layout's
 * `column{2,MAX_COLUMNS}` content expression below (single source; the
 * wrapIntoColumns command and the drag edge-zone resolver import it).
 */
export const MAX_COLUMNS = 5

// `columnLayout` is a normal Rune body block (createBlockSpec → id/depth,
// __runeBlockSpec marker, draggable as one unit, projects to public JSON).
// Its content is `column{2,5}` — 2..5 columns enforced at the schema
// level (PROBE confirmed PM supports range quantifiers natively in this
// version). Each `column` is a structural node (blocks/Columns/nodes.ts)
// whose children are first-class body blocks.
//
// The `column` node is shipped through this block's `extensions: [...]`
// array (Table precedent) — ZERO kit.ts special-casing.
export const ColumnLayout = createBlockSpec({
  type: "columnLayout",
  content: `column{2,${MAX_COLUMNS}}`,
  // Agent input contract: the populated, round-trippable shape `toRuneBlock`
  // emits — `columns: [{ width, children: RuneBlockInput[] }]`, 2..5 columns,
  // each child a first-class body block. fromInput is the inverse; this is what
  // an agent needs to author a layout (the empty `defaultColumnsInput` sugar is
  // a slash-menu internal, not advertised).
  schemaContext: {
    input: {
      description:
        "A 2..5 column layout. Each column has a relative `width` and a `children` array of body blocks (the same RuneBlockInput shape as top-level blocks).",
      examples: [
        {
          type: "columnLayout",
          columns: [
            { width: 1, children: [{ type: "paragraph", text: "Left column" }] },
            { width: 1, children: [{ type: "paragraph", text: "Right column" }] },
          ],
        },
      ],
    },
  },
  // Non-indentable (spec): nesting depth on a multi-column container has
  // no defined visual meaning. Same rationale as Table / Divider.
  indent: { mode: "numeric", maxDepth: 0 },
  // isolating: editing operations don't spill across the layout boundary.
  meta: { isolating: true },
  // The whole layout drags as ONE unit. It's a root body block, so the
  // side-menu / block-drag machinery treats it like any other draggable
  // block via the default `dragSourceRange` (the layout's own node range).
  // Handle priority is F3 (columns Phase 2): INNERMOST draggable wins — a
  // block inside a column gets its OWN grip; the layout's handle is what
  // hover resolves to on layout chrome / inter-column gap hits
  // (side-menu/block-registry.ts `draggableAncestorPosFor`).
  sideMenu: { draggable: true },
  // Ship the structural `column` node AND the columns support plugins
  // (normalization: col id backfill + width clamp; keyboard boundaries;
  // boundary-drag resize) through the block's extensions so kit.ts needs
  // no special-casing.
  extensions: [Column, ColumnsNormalization, ColumnsKeyboard, ColumnsResize],

  parseDOM: [{ tag: "div[data-rune-columns]" }],
  renderDOM: ({ HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, "data-rune-columns": "", class: "rune-block rune-columns" },
    0,
  ],

  // Clipboard text/html: degrade the layout to a bare <div> with NO
  // layout chrome (no .rune-columns class, no data-* attrs). The columns
  // inside degrade in lockstep — `column` declares its own chrome-free
  // `clipboardDOM` (a bare <div>), which buildClipboardSerializer honours.
  // Net output is `<div><div>…children…</div><div>…children…</div></div>`
  // — a flat, chrome-free block sequence that pastes cleanly into Notion /
  // TextEdit / GitHub.
  clipboardRenderDOM: () => ["div", {}, 0],

  // Plain-text projection for editor.getText: blocks WITHIN a column join
  // with single newlines (PM's `textContent` would concatenate them with
  // NO separator), and column boundaries become blank lines so a flat
  // read still separates the columns.
  //
  // NOTE this does NOT shape clipboard text/plain: PM's
  // Fragment.textBetween applies text serializers to LEAF nodes only, so
  // a copied layout descends into its textblocks and joins them all with
  // the uniform "\n\n" block separator (see extensions/clipboard/
  // serializeBlocks.ts) — consistent with how root-level blocks copy.
  renderText: ({ node }) => {
    const parts: string[] = []
    node.forEach((column) => {
      const childTexts: string[] = []
      column.forEach((child) => {
        childTexts.push(child.textContent)
      })
      parts.push(childTexts.join("\n"))
    })
    return parts.join("\n\n")
  },

  // E1 — slash menu entries. One item per column count (2..MAX_COLUMNS);
  // each inserts an N-column layout via this block's `fromInput` and lands
  // the caret in the layout's first leaf — the first column's seeded empty
  // paragraph. `block.props.columns` is spread into the input so `fromInput`
  // sees `input.columns`. Block-owned via the spec (no kit.ts
  // special-casing); the React layer maps the `columns_N` keys to icons.
  // The shared "columns" alias means typing `/columns` surfaces all four —
  // the 2-column item comes first (filterSuggestionItems ties break on
  // source order), so `/columns` + Enter still inserts the 2-col default.
  slashMenuItems: () => {
    return Array.from({ length: MAX_COLUMNS - 1 }, (_, i) => {
      const count = i + 2
      const block = { type: "columnLayout", props: defaultColumnsInput(count) }
      return {
        key: `columns_${count}`,
        title: `${count} columns`,
        aliases: [`${count} columns`, "columns", "column", "layout"],
        group: "Basic blocks",
        block,
        onItemClick: (ctx: SuggestionCommitContext) => {
          // No-nesting insert guard (Task 3 Step 3, slash-menu leg): a
          // `/columns` committed from INSIDE a column must refuse — full
          // no-op, mirroring the fromInput-null refusal precedent. Without
          // it the nested layout lands and normalization flattens it into
          // stray paragraphs inside the column.
          if (
            insertWouldNestColumnLayout(ctx.editor.state.doc, ctx.range.from, [
              { type: "columnLayout" },
            ])
          ) {
            return
          }
          insertOrUpdateBlockForSlashMenu(ctx, block)
        },
      }
    })
  },

  // Recursive projection (first LIVE use of the Phase-0 `ctx`). The layout's
  // DIRECT children are `column` STRUCTURAL nodes — they carry no
  // __runeBlockSpec marker, so `ctx.projectChild(column)` returns null. The
  // projection therefore operates TWO LEVELS DOWN: iterate the columns
  // ourselves, and for each column map `ctx.projectChild` over THAT column's
  // body-block children (paragraphs/headings/lists/…). projectChild is
  // `blockFromNode`, so a nested child projects identically to a top-level
  // one — and recurses again for a nested layout (forbidden in v1, but the
  // mechanism is uniform).
  toRuneBlock: (node, ctx): RuneColumnsBlock => {
    const columns: RuneColumn[] = []
    node.forEach((column) => {
      const children: RuneBlock[] = []
      column.forEach((child) => {
        const projected = ctx?.projectChild(child)
        if (projected) children.push(projected)
      })
      columns.push({
        id: typeof column.attrs.id === "string" ? column.attrs.id : "",
        // normalizeColumnWidth, not a bare typeof check: NaN/-1 pass
        // `typeof === "number"` and would leak into the public projection.
        width: normalizeColumnWidth(column.attrs.width),
        children,
      })
    })
    return {
      type: "columnLayout",
      id: typeof node.attrs.id === "string" ? node.attrs.id : "",
      depth: typeof node.attrs.depth === "number" ? node.attrs.depth : 0,
      columns,
    }
  },

  // Inverse of toRuneBlock (JSON↔node symmetry, used by insertBlocks). Build
  // a `column` node per input column, recursively constructing each child
  // body block via `createNodeFromBlockInput` (the same per-input dispatch
  // insertBlocks runs top-level — so a child rebuilds identically wherever it
  // lives). Returns null if the schema lacks the columns nodes or the input
  // does not describe a valid 2..5-column layout.
  fromInput: ({ schema, input, defaults, editor }) => {
    const layoutType = schema.nodes.columnLayout
    const columnType = schema.nodes.column
    if (!layoutType || !columnType) return null
    if (!editor) return null

    const columnsInput = (input as { columns?: unknown }).columns
    if (!Array.isArray(columnsInput) || columnsInput.length === 0) return null

    const columnNodes: ProseMirrorNode[] = []
    for (const col of columnsInput) {
      // A column entry must be a plain object. `typeof [] === "object"`, so the
      // null check alone would let an array through — it would destructure to
      // all-undefined and silently become a blank column. Reject it instead.
      if (typeof col !== "object" || col === null || Array.isArray(col)) return null
      const { id, width, children } = col as {
        id?: unknown
        width?: unknown
        children?: unknown
      }
      const childInputs = Array.isArray(children) ? children : []
      const childNodes: ProseMirrorNode[] = []
      for (const child of childInputs) {
        // No nested layouts (v1 invariant — blocks/Columns/normalization.ts):
        // a columnLayout may not live inside a column. createNodeFromBlockInput
        // WOULD build one (a column's content is `block+`), and the
        // normalization pass then silently flattens it — merging the inner
        // columns' children into this column and discarding their structure /
        // widths. Reject up front so the insert refuses cleanly, mirroring the
        // `insertWouldNestColumnLayout` guard on the position side.
        if ((child as { type?: unknown } | null)?.type === "columnLayout") {
          return null
        }
        const childNode = createNodeFromBlockInput(
          editor,
          schema,
          child as RuneBlockInput,
          { depth: 0 },
        )
        if (!childNode) return null
        childNodes.push(childNode)
      }
      // E2 invariant analog: a column always holds ≥1 body block. If the
      // input column is empty, seed an empty paragraph so the node is valid.
      if (childNodes.length === 0) {
        const para = schema.nodes.paragraph?.create()
        if (!para) return null
        childNodes.push(para)
      }
      const columnNode = columnType.create(
        {
          id: typeof id === "string" ? id : null,
          // normalizeColumnWidth: a NaN/negative input width would otherwise
          // sit invalid in the doc until the normalization round.
          width: normalizeColumnWidth(width),
        },
        childNodes,
      )
      columnNodes.push(columnNode)
    }

    // Reject an out-of-range column count up front. createAndFill alone is
    // NOT enough: for too-FEW columns it fabricates empty ones up to the
    // schema minimum (1 col -> a silent 2-col layout), which is not the
    // caller's intent. Only too-MANY would make createAndFill return null.
    // validContent enforces the schema's column{2,5} bound (and rejects the
    // empty fragment), so it covers both ends.
    if (!layoutType.validContent(Fragment.from(columnNodes))) return null

    const attrs = {
      ...defaults.attrs,
      id: input.id ?? null,
      depth: input.depth ?? defaults.depth,
    }
    return layoutType.createAndFill(attrs, columnNodes, defaults.marks)
  },
})

export interface RuneColumn {
  id: string
  width: number
  children: RuneBlock[]
}

export interface RuneColumnsBlock extends RuneBlockBase {
  type: "columnLayout"
  columns: RuneColumn[]
}

export { Column } from "./nodes"
