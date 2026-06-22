// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { SideMenuState, SideMenuStorage, SideMenuHoveredBlock } from "./types"
import { draggableAncestorPosFor, isDraggable } from "./block-registry"
import { buildWidget } from "./widget"
import { isGestureActive } from "../shared/gesture-state"
import { flushDomObserver } from "../shared"
import { blockSelectionKey } from "../block-selection/plugin"
import { MultiBlockSelection } from "../block-selection/MultiBlockSelection"
import { getMarqueeZone } from "../block-selection/marquee"
import { resolveBodyBlockById, surfaceChildrenAt } from "../../schema/bodySurface"

const EMPTY: SideMenuState = { hoveredPos: null }
export const sideMenuKey = new PluginKey<SideMenuState>("rune-side-menu")

const GUTTER_PX = 60
// Width of the in-column grip approach corridor: the inter-column gutter
// (--rune-col-gutter, 24px) plus the grip's overhang into the previous
// column (grip offset ~30px + grip width). Must cover the full horizontal
// extent of an in-column block's grip so the pointer can reach it without
// hover re-resolving (see the corridor guard in compute()).
const GRIP_CORRIDOR_PX = 40
const EDITOR_CHROME_SELECTOR = "[data-rune-editor-chrome]"

type RuneWidgetDecorationSpec = NonNullable<Parameters<typeof Decoration.widget>[2]> & {
  /** PM runtime escape hatch for textblock widgets — see widget.ts. */
  raw: true
}

export const SideMenu = Extension.create({
  name: "sideMenu",

  addStorage(): SideMenuStorage {
    return { hoveredBlock: null }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<SideMenuState>({
        key: sideMenuKey,

        state: {
          init: () => EMPTY,
          apply: (tr, prev) => {
            const meta = tr.getMeta(sideMenuKey) as SideMenuState | undefined
            if (meta) return meta
            if (tr.docChanged) return EMPTY
            return prev
          },
        },

        props: {
          decorations(state) {
            if (!editor.isEditable) return null
            const s = sideMenuKey.getState(state) ?? EMPTY
            const bs = blockSelectionKey.getState(state)

            // Pin to dropdown block when one is open. If the dropdown block has
            // been deleted, fall through to hoveredPos so we don't return null
            // and lose the widget mid-interaction. Surface-aware lookup: the
            // dropdown block may be a COLUMN child (not a root child), which
            // the root-only topLevelBlockPosById would miss — unmounting an
            // in-column dropdown on the first doc-changing action.
            let effectivePos = s.hoveredPos
            if (bs?.dropdownBlockId) {
              const pinned = resolveBodyBlockById(state.doc, bs.dropdownBlockId)
              if (pinned) effectivePos = pinned.pos
            }

            if (effectivePos === null) return null
            const top = state.doc.resolve(effectivePos).nodeAfter
            if (!top) return null
            if (!isDraggable(top.type.name, editor)) return null

            const hoveredPos = effectivePos
            if (top.isAtom) {
              return DecorationSet.create(state.doc, [
                Decoration.node(
                  hoveredPos,
                  hoveredPos + top.nodeSize,
                  { class: "rune-side-menu-active" },
                  { key: "rune-side-menu" },
                ),
              ])
            }

            const widgetSpec: RuneWidgetDecorationSpec = {
              side: -1,
              key: "rune-side-menu",
              ignoreSelection: true,
              raw: true,
            }

            return DecorationSet.create(state.doc, [
              Decoration.widget(
                hoveredPos + 1,
                () => buildWidget(hoveredPos, editor),
                widgetSpec,
              ),
            ])
          },
        },

        view(view) {
          const syncStorage = () => {
            const s = sideMenuKey.getState(view.state) ?? EMPTY
            const storage = (editor.storage as unknown as { sideMenu: SideMenuStorage }).sideMenu
            if (s.hoveredPos === null) {
              storage.hoveredBlock = null
              return
            }
            const node = view.state.doc.nodeAt(s.hoveredPos)
            if (!node) return
            const next: SideMenuHoveredBlock = {
              pos: s.hoveredPos,
              id: (node.attrs.id as string | null) ?? "",
              type: node.type.name,
            }
            storage.hoveredBlock = next
          }

          let rafId = 0
          let pendingX = 0
          let pendingY = 0

          const compute = () => {
            rafId = 0
            // A gesture may have claimed the registry (e.g. a marquee sweep
            // started) between the rAF being scheduled and this callback
            // firing. Suppress the hover dispatch so we don't paint a
            // hoveredPos mid-gesture — mirrors the onMouseMove early-return.
            if (isGestureActive(view.state)) return
            // Hover-only side-menu transactions must not overwrite a
            // fresh browser caret with stale PM state. If the user just
            // clicked into text, ingest that DOM selection before we
            // dispatch hoveredPos.
            flushDomObserver(view)
            const editorRect = view.dom.getBoundingClientRect()
            // posAtCoords needs a point inside .ProseMirror — clamp the
            // probe X to the editor's content column. Y goes through as-is
            // so cursors in left/right page gutters still snap to the
            // block at that vertical position (Notion-style hover).
            const probeX = Math.max(
              editorRect.left + 1,
              Math.min(pendingX, editorRect.right - 1),
            )
            const hit = view.posAtCoords({ left: probeX, top: pendingY })
            let nextPos = hit ? draggableAncestorPosFor(view, hit.pos, editor) : null

            // ATOM caret-bias correction: posAtCoords' `pos` on an atom leaf
            // (image/video/divider) is a CARET position — pointing at the
            // right half resolves to the boundary AFTER the node, which the
            // ancestor walk reads as the NEXT block (grip + media bar would
            // target the wrong block for half the atom's surface).
            // `hit.inside` names the node the point is physically within;
            // prefer it when that node is a draggable atom. Textblocks keep
            // the ancestor-walk result (their pos is always inside).
            if (hit && hit.inside >= 0) {
              const insideNode = view.state.doc.nodeAt(hit.inside)
              if (insideNode?.isAtom && isDraggable(insideNode.type.name, editor)) {
                nextPos = hit.inside
              }
            }

            if (nextPos !== null) {
              const node = view.state.doc.nodeAt(nextPos)
              if (node) {
                const dom = view.nodeDOM(nextPos) as HTMLElement | null
                if (dom && pendingY > dom.getBoundingClientRect().bottom) {
                  const sibPos = nextPos + node.nodeSize
                  // Bound the sibling-below fallback by the block's CONTAINING
                  // SURFACE, not the whole doc. An in-column block at the bottom
                  // of its column must NOT fall through to a doc-level next
                  // sibling (the column's close token / the next column). The
                  // surface's children span [start, start + content.size).
                  const surface = surfaceChildrenAt(view.state.doc, nextPos)
                  const surfaceEnd = surface
                    ? surface.start + surface.node.content.size
                    : view.state.doc.content.size
                  if (sibPos < surfaceEnd) nextPos = sibPos
                }
              }
            }

            const prev = sideMenuKey.getState(view.state) ?? EMPTY
            if (prev.hoveredPos === nextPos) return
            // Grip approach corridor (columns F3). An in-column block's grip
            // is rendered LEFT of the block, in the inter-column gutter —
            // the same strip whose cold hover resolves to the LAYOUT grip.
            // Without this guard, the journey from the block's text to its
            // own grip crosses bare gutter pixels, hover flips to the layout
            // mid-approach, and the grip unmounts before the pointer reaches
            // it (reproduced by in-column-grip-journey e2e). While the
            // CURRENT hover is an in-column block and the pointer stays in
            // that block's Y band within GRIP_CORRIDOR_PX left of its content
            // edge, keep the hover. Cold gutter entry (no in-column hover
            // yet) is unaffected — the gap still resolves to the layout.
            if (prev.hoveredPos !== null && nextPos !== prev.hoveredPos) {
              const prevSurface = surfaceChildrenAt(view.state.doc, prev.hoveredPos)
              if (prevSurface && prevSurface.pos !== -1) {
                const prevDom = view.nodeDOM(prev.hoveredPos) as HTMLElement | null
                if (prevDom) {
                  const r = prevDom.getBoundingClientRect()
                  const inCorridor =
                    pendingX < r.left &&
                    pendingX >= r.left - GRIP_CORRIDOR_PX &&
                    pendingY >= r.top &&
                    pendingY <= r.bottom
                  if (inCorridor) return
                }
              }
            }
            view.dispatch(view.state.tr.setMeta(sideMenuKey, { hoveredPos: nextPos }))
          }

          const onMouseMove = (e: MouseEvent) => {
            if (!editor.isEditable) return
            if (isGestureActive(view.state)) return
            const target = e.target
            if (target instanceof Element && target.closest(".rune-side-menu")) return
            if (target instanceof Element && target.closest(EDITOR_CHROME_SELECTOR)) return

            // Hot-zone width depends on selection state, not just the
            // editor's bbox. The narrow form (editor + 60px left gutter
            // for the grip's physical pixel position) is correct while
            // the user is editing — widening it triggers extra compute()
            // calls during typing whose dispatched sideMenuKey transactions
            // remount the side-menu widget decoration and race with the
            // active keystroke flow.
            //
            // While MBS is the selection (no typing in flight), expand
            // X to the host's marquee zone if registered: the user is
            // mid-selection and likely about to shift-click another
            // block from anywhere in the page row, so the grip should
            // surface in gutters too. Y stays bounded by the editor's
            // vertical extent either way so we don't fight a host title
            // row above.
            const editorRect = view.dom.getBoundingClientRect()
            const sel = view.state.selection
            const zone = sel instanceof MultiBlockSelection ? getMarqueeZone(view) : null
            const zoneRect = zone?.getBoundingClientRect()
            const hotRect = {
              left: zoneRect?.left ?? editorRect.left - GUTTER_PX,
              right: zoneRect?.right ?? editorRect.right,
              top: editorRect.top,
              bottom: editorRect.bottom,
            }
            const inHotZone =
              e.clientX >= hotRect.left && e.clientX <= hotRect.right &&
              e.clientY >= hotRect.top && e.clientY <= hotRect.bottom

            if (!inHotZone) {
              if (rafId !== 0) {
                cancelAnimationFrame(rafId)
                rafId = 0
              }
              const prev = sideMenuKey.getState(view.state) ?? EMPTY
              if (prev.hoveredPos !== null) {
                view.dispatch(view.state.tr.setMeta(sideMenuKey, EMPTY))
              }
              return
            }

            pendingX = e.clientX
            pendingY = e.clientY
            if (rafId !== 0) return
            rafId = requestAnimationFrame(compute)
          }

          document.addEventListener("mousemove", onMouseMove)
          syncStorage()

          return {
            update() {
              syncStorage()
            },
            destroy() {
              if (rafId !== 0) cancelAnimationFrame(rafId)
              document.removeEventListener("mousemove", onMouseMove)
            },
          }
        },
      }),
    ]
  },
})
