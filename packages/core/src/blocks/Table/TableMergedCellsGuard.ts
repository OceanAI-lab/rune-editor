// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { fixTables } from '@tiptap/pm/tables'
import { expandMergedCells } from './expandMergedCells'
import { INTERNAL_NORMALIZATION_META } from '../../extensions/internal-meta'

// Three layers to keep merged cells (colspan/rowspan > 1) out of the doc:
//   1. parseHTML on tableCell/tableHeader (see index.ts) forces the attrs to 1
//      whenever Tiptap parses a DOM element into a node.
//   2. transformPastedHTML here rewrites merged <td>/<th> into 1×1 grids
//      BEFORE ProseMirror parses, preserving Notion-like visual positioning.
//   3. appendTransaction here is a safety net for programmatic paths
//      (setContent, collab sync, etc.) that bypass transformPastedHTML.
//      It clamps any stray spans to 1 and calls fixTables to rectangularize.
//
// Product decision (2026-04-17): rune does not support merged cells.

// Test-only escape hatch. Disables this extension's appendTransaction
// clamp + fixTables call so future M8.4e-b e2e specs can park merged
// cells in the doc to exercise prosemirror-tables' indexing edge cases.
// NOTE: this only bypasses appendTransaction; transformPastedHTML
// (lines below) still normalizes pasted HTML, so tests must build
// merged-cell docs via setContent / direct PM transactions, not via
// paste. Setting this meta to `true` on any tx flips a sticky
// plugin-state flag that disables the guard for the editor's lifetime
// — fine for the per-test fresh-editor lifecycle Playwright gives us,
// never set in production. No e2e spec consumes the flag yet (defer to
// M8.4e-b); the hatch ports forward from V1 so it's ready when needed.
const TEST_BYPASS_META = 'rune.testOnly.bypassMergedCellsGuard'

const tableMergedCellsGuardKey = new PluginKey<{ bypass: boolean }>(
  'rune-table-merged-cells-guard',
)

export const TableMergedCellsGuard = Extension.create({
  name: 'tableMergedCellsGuard',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableMergedCellsGuardKey,
        state: {
          init: () => ({ bypass: false }),
          apply: (tr, prev) => {
            if (tr.getMeta(TEST_BYPASS_META) === true) return { bypass: true }
            return prev
          },
        },
        props: {
          transformPastedHTML(html) {
            return expandMergedCells(html)
          },
        },
        appendTransaction(_trs, _oldState, newState) {
          if (tableMergedCellsGuardKey.getState(newState)?.bypass) return null

          const schema = newState.schema
          const cellType = schema.nodes.tableCell
          const headerType = schema.nodes.tableHeader
          if (!cellType && !headerType) return null

          const clampTr = newState.tr
          let mutated = false
          newState.doc.descendants((node, pos) => {
            if (node.type !== cellType && node.type !== headerType) return
            const colspan = node.attrs.colspan
            const rowspan = node.attrs.rowspan
            if (colspan > 1 || rowspan > 1) {
              clampTr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                colspan: 1,
                rowspan: 1,
                colwidth: null,
              })
              mutated = true
            }
          })

          if (!mutated) return null
          // Rectangularize any jagged rows that result from clamping spans.
          // fixTables(state) returns a tr (or null) whose steps pad jagged
          // rows; we replay its steps on top of our clamp tr so the caller
          // sees one coherent transaction.
          const postClamp = newState.apply(clampTr)
          const fix = fixTables(postClamp)
          if (fix) {
            for (const step of fix.steps) clampTr.step(step)
          }
          // Schema normalization — never user-visible as an edit. Skip the
          // undo stack (undo shouldn't restore merged cells) AND tag the
          // shared internal-normalization meta so consumers filtering for
          // user edits can distinguish this from a real change.
          clampTr.setMeta('addToHistory', false)
          clampTr.setMeta(INTERNAL_NORMALIZATION_META, true)
          return clampTr
        },
      }),
    ]
  },
})
