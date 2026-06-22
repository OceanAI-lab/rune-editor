// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { BlockDragState } from "./types"
import { setupBlockDrag } from "./gesture"
import { surfaceChildrenAt } from "../../schema/bodySurface"

const EMPTY: BlockDragState = { draggingRange: null }
export const blockDragKey = new PluginKey<BlockDragState>("rune-block-drag")
export const GHOST_CLASS = "rune-block-drag-ghost"

export function isDragging(state: EditorState): boolean {
  return blockDragKey.getState(state)?.draggingRange != null
}

export const BlockDrag = Extension.create({
  name: "blockDrag",

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<BlockDragState>({
        key: blockDragKey,
        state: {
          init: () => EMPTY,
          apply(tr, prev) {
            const meta = tr.getMeta(blockDragKey) as BlockDragState | undefined
            if (meta) return meta
            return prev
          },
        },
        props: {
          handleDOMEvents: {
            // Suppress native HTML5 DnD of any selection inside the editor.
            // Letting it through lets contenteditable move/copy the selected
            // text on drop AND lets PM's dropcursor (bundled by StarterKit)
            // paint a stray indicator. Notion no-ops this gesture; matching
            // that, block movement only happens via the side-menu grip or
            // padding-drag — neither uses HTML5 dragstart.
            dragstart: (_view, event) => {
              event.preventDefault()
              return true
            },
          },
          decorations(state) {
            const s = blockDragKey.getState(state) ?? EMPTY
            if (s.draggingRange === null) return null
            const decos: Decoration[] = []
            const range = s.draggingRange
            // Walk the dragged blocks' SURFACE (root OR a column — Task 3).
            // `Decoration.node` positions are absolute and work for nested
            // (column-child) blocks; only the iteration must scope to the
            // source surface, since a bare `doc.forEach` is root-level and would
            // miss a column drag's blocks (no ghost dimming on them).
            const surface = surfaceChildrenAt(state.doc, range.from)
            if (surface) {
              let offset = surface.start
              surface.node.forEach((node) => {
                if (offset >= range.from && offset + node.nodeSize <= range.to) {
                  decos.push(
                    Decoration.node(offset, offset + node.nodeSize, { class: GHOST_CLASS }),
                  )
                }
                offset += node.nodeSize
              })
            }
            return decos.length > 0 ? DecorationSet.create(state.doc, decos) : null
          },
        },
        view(view) {
          const gesture = setupBlockDrag(view, editor)
          return {
            // Abort the live gesture whenever the doc changes underneath it
            // (#307): every position the gesture captured (active.range,
            // lastTarget.insertPos, zoneTarget positions) is raw — a drop
            // after an external docChanged tr (collab, programmatic insert)
            // would address the post-change doc and move the wrong blocks.
            // Cancel on ANY docChanged tr rather than position-map: the only
            // self-inflicted attr-only tr that could fire mid-drag (BlockId
            // backfill — setNodeMarkup, so docChanged=true) only ever follows
            // another docChanged tr, which already aborts the gesture.
            // The gesture's OWN drop never re-enters here: onMouseUp runs the
            // full cleanup BEFORE dispatching the drop transaction, and
            // gesture.cancel() no-ops when nothing is live.
            update(v, prevState) {
              if (v.state.doc !== prevState.doc) gesture.cancel()
            },
            destroy() {
              gesture.destroy()
            },
          }
        },
      }),
    ]
  },
})
