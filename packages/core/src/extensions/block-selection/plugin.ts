// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { NodeSelection, Plugin, PluginKey, Selection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { EditorView } from "@tiptap/pm/view"
import {
  topLevelBlockIndexById as indexOfBlockId,
  topLevelBlockPosById as positionOfBlockId,
  topLevelBlockStartPos,
} from "../../schema/topLevelBlocks"
import { surfaceChildrenAt, resolveBodyBlockById } from "../../schema/bodySurface"
import { MultiBlockSelection } from "./MultiBlockSelection"
import { isDragging } from "../block-drag/BlockDrag"

/** Which chrome surface the open dropdown is anchored to: the side-menu
 *  grip (default) or the media floating bar's `•••` button. The React
 *  dropdown reads this to pick the anchor rect; the menu content is
 *  identical either way. */
export type BlockActionsDropdownAnchor = "grip" | "media-bar"

export type BlockSelectionPluginState = {
  anchorBlockId: string | null
  dropdownBlockId: string | null
  dropdownAnchor: BlockActionsDropdownAnchor
}

export type BlockSelectionPluginMeta = {
  setAnchor?: string | null // explicit null clears anchor
  openDropdownFor?: string  // set when grip click should open the dropdown
  /** Anchor surface for openDropdownFor; defaults to "grip" when omitted. */
  dropdownAnchor?: BlockActionsDropdownAnchor
  closeDropdown?: true       // set when dropdown is closing (Esc / outside-click / item pick)
}

export const blockSelectionKey = new PluginKey<BlockSelectionPluginState>("rune-block-selection")

const INITIAL: BlockSelectionPluginState = {
  anchorBlockId: null,
  dropdownBlockId: null,
  dropdownAnchor: "grip",
}

// Map a dragSourceRange (PM position range) to top-level child indices.
// `clickedIdx` is the gripped block — also the index that `range.from`
// should resolve to (the hook always starts at the gripped pos). Falls
// back to a single-block range when no chain hook was supplied.
function chainIndexBounds(
  doc: import("@tiptap/pm/model").Node,
  clickedIdx: number,
  range: { from: number; to: number } | undefined,
): [number, number] {
  if (!range) return [clickedIdx, clickedIdx]
  let pos = 0
  let hi = clickedIdx
  for (let i = 0; i < doc.childCount; i++) {
    const size = doc.child(i).nodeSize
    if (pos >= range.from && pos < range.to) hi = i
    pos += size
    if (pos >= range.to) break
  }
  return [clickedIdx, hi]
}

// Public surface for the grip gesture: block-drag/gesture.ts owns the
// single mousedown→mousemove→mouseup state machine for the grip and
// calls this on a release-without-threshold-cross. Keeping it here (not
// in BlockDrag) preserves the separation: drag decides "is this a
// click?", selection decides "what does a click do?".
//
// Why a snapshot: the toggle / shift-extend branches need to read the
// MBS state and anchor that the user *saw* when they pressed the grip.
// Between mousedown and mouseup, the browser's focus pipeline can
// override our MultiBlockSelection (PM's DOMObserver dispatches a
// pointer-tagged TextSelection from a stray DOM caret during a focus
// shuffle — happens on idle pauses too, not just the click itself).
// gesture.ts captures the snapshot synchronously on mousedown and
// hands it back here so user intent survives the override window.
export type GripGestureSnapshot = {
  sel: import("@tiptap/pm/state").Selection
  anchorBlockId: string | null
  // Captured at mousedown so the in-MBS branch can decide close-vs-open
  // without racing Radix's onPointerDownOutside (fires on pointerdown,
  // BEFORE mousedown, and would otherwise null this out via handleOpenChange
  // before applyGripClick runs at mouseup).
  dropdownBlockId: string | null
}

export type BlockSelectionApi = {
  snapshotForGripDown(): GripGestureSnapshot
  applyGripClick(opts: {
    blockPos: number
    // Chain range from the gripped block's `dragSourceRange` hook (list /
    // toggle subtree). When provided AND the click lands on an idle block
    // (not inside an existing MBS, not shift-extending), the resulting
    // MBS spans the whole range — keeping click MBS in lock-step with
    // what the drag path would pick up. Omit for single-block selection.
    range?: { from: number; to: number }
    shiftKey: boolean
    snapshot: GripGestureSnapshot
  }): void
}

const viewToApi = new WeakMap<EditorView, BlockSelectionApi>()

export function getBlockSelectionApi(view: EditorView): BlockSelectionApi | undefined {
  return viewToApi.get(view)
}

/** Surface-local index of the block at `blockPos` among `surface`'s children. */
function surfaceLocalIndex(
  surface: { node: import("@tiptap/pm/model").Node; start: number },
  blockPos: number,
): number {
  let idx = -1
  let offset = surface.start
  let i = 0
  surface.node.forEach((child) => {
    if (offset === blockPos) idx = i
    offset += child.nodeSize
    i += 1
  })
  return idx
}

/**
 * Grip click on a block that lives on a NON-root surface (a `column`). The
 * root-only id→index lookup misses it, so resolve the block on its own
 * surface and build a column-local MBS + open its dropdown.
 *
 * Task 5: shift-extend is column-local. When `shiftKey` and the stored anchor
 * resolves to a block on the SAME column surface, extend anchor→clicked
 * (column-local). A shift-click whose anchor is on a DIFFERENT surface (or no
 * anchor) does NOT make a cross-surface MBS — it falls back to a fresh
 * single-block MBS on the clicked block's surface (over-select-safe, preserving
 * the same-parent invariant). The dropdown opens for the clicked block.
 *
 * Re-click parity (spec §1.1, mirrors the root in-MBS branch): a plain click
 * on a block already inside the snapshot's COLUMN-LOCAL MBS re-asserts the
 * MBS and TOGGLES the dropdown (close when it was open for the clicked block,
 * open otherwise) instead of re-opening unconditionally.
 */
function applyInColumnGripClick(
  view: EditorView,
  blockPos: number,
  clickedId: string,
  shiftKey: boolean,
  snapshot: GripGestureSnapshot,
): void {
  const doc = view.state.doc
  const anchorId = snapshot.anchorBlockId
  const surface = surfaceChildrenAt(doc, blockPos)
  // -1 surface (root) shouldn't reach here (root blocks resolve via index),
  // but guard anyway: no surface → nothing to select.
  if (!surface || surface.pos === -1) return

  const clickedIdx = surfaceLocalIndex(surface, blockPos)
  if (clickedIdx < 0) return

  // A ResolvedPos whose `.parent` is the column surface (so MBS.create reads
  // the column's children, not the doc's).
  const $surface = doc.resolve(surface.start)

  // Click on a block already inside a column-local MBS ON THIS SAME column
  // surface (snapshot state — see applyGripClick's root branch for why the
  // mousedown snapshot, not view.state, decides). Re-assert the MBS, keep the
  // anchor, and toggle the dropdown. The same-surface check is strict: a ROOT
  // MBS covering the layout must NOT have its root indices re-interpreted as
  // column indices here.
  const snapSel = snapshot.sel
  if (!shiftKey && snapSel instanceof MultiBlockSelection) {
    const snapSurfacePos =
      snapSel.$anchor.depth === 0 ? -1 : snapSel.$anchor.before(snapSel.$anchor.depth)
    const [lo, hi] = snapSel.blockIndices
    if (snapSurfacePos === surface.pos && clickedIdx >= lo && clickedIdx <= hi) {
      const wasOpen = snapshot.dropdownBlockId === clickedId
      view.dispatch(
        view.state.tr
          .setSelection(MultiBlockSelection.create(doc, lo, hi, $surface))
          .setMeta(blockSelectionKey, {
            ...(wasOpen
              ? { closeDropdown: true as const }
              : { openDropdownFor: clickedId }),
            setAnchor: anchorId,
          }),
      )
      return
    }
  }

  // Shift-extend: only when the anchor lives on the SAME column surface.
  if (shiftKey && anchorId) {
    const anchor = resolveBodyBlockById(doc, anchorId)
    if (anchor && anchor.surfacePos === surface.pos) {
      view.dispatch(
        view.state.tr
          .setSelection(
            MultiBlockSelection.create(doc, anchor.indexInSurface, clickedIdx, $surface),
          )
          // Keep the stored anchor (the shift-extend pivot); open the dropdown
          // for the clicked block, mirroring the root shift-extend path.
          .setMeta(blockSelectionKey, { openDropdownFor: clickedId }),
      )
      return
    }
    // Anchor on a different surface (or gone) — fall through to a fresh
    // single-block MBS. Never a cross-surface range.
  }

  view.dispatch(
    view.state.tr
      .setSelection(MultiBlockSelection.create(doc, clickedIdx, clickedIdx, $surface))
      .setMeta(blockSelectionKey, {
        setAnchor: clickedId,
        openDropdownFor: clickedId,
      }),
  )
}

/**
 * Open the block-actions dropdown for `blockId` from chrome OTHER than the
 * grip (e.g. the media floating bar's `•••`). Mirrors the grip-click
 * recipe — an MBS on the block's own surface + the openDropdownFor meta —
 * so the dropdown renders the exact same menu the grip produces. Like the
 * grip branches above, a block already inside an active same-surface MBS
 * re-asserts the full lo..hi range (and keeps the stored anchor) instead
 * of collapsing the user's selection to one block. `anchor` tells the
 * React dropdown which element to anchor its popover to.
 */
export function openBlockActionsDropdown(
  view: EditorView,
  blockId: string,
  anchor: BlockActionsDropdownAnchor = "grip",
): boolean {
  const doc = view.state.doc
  const resolved = resolveBodyBlockById(doc, blockId)
  if (!resolved) return false

  let $surface: ReturnType<typeof doc.resolve> | undefined
  if (resolved.surfacePos !== -1) {
    const surface = surfaceChildrenAt(doc, resolved.pos)
    if (!surface || surface.pos === -1) return false
    $surface = doc.resolve(surface.start)
  }

  let lo = resolved.indexInSurface
  let hi = resolved.indexInSurface
  let anchorId = blockId
  const sel = view.state.selection
  if (sel instanceof MultiBlockSelection) {
    const selSurfacePos =
      sel.$anchor.depth === 0 ? -1 : sel.$anchor.before(sel.$anchor.depth)
    const [selLo, selHi] = sel.blockIndices
    if (
      selSurfacePos === resolved.surfacePos &&
      resolved.indexInSurface >= selLo &&
      resolved.indexInSurface <= selHi
    ) {
      lo = selLo
      hi = selHi
      anchorId =
        blockSelectionKey.getState(view.state)?.anchorBlockId ?? blockId
    }
  }

  view.dispatch(
    view.state.tr
      .setSelection(MultiBlockSelection.create(doc, lo, hi, $surface))
      .setMeta(blockSelectionKey, {
        setAnchor: anchorId,
        openDropdownFor: blockId,
        dropdownAnchor: anchor,
      }),
  )
  return true
}

export function blockSelectionPlugin(): Plugin<BlockSelectionPluginState> {
  // Historical note: the delayed DOMObserver reclaim path was retired after
  // grip mousedown `preventDefault()` proved it avoids the blur /
  // selectionchange cascade. Snapshot-based applyGripClick below remains as
  // the defense against stale state between mousedown and mouseup.

  const applyGripClick = (
    view: EditorView,
    opts: {
      blockPos: number
      range?: { from: number; to: number }
      shiftKey: boolean
      snapshot: GripGestureSnapshot
    },
  ) => {
    const node = view.state.doc.nodeAt(opts.blockPos)
    const clickedId = (node?.attrs.id as string | null | undefined) ?? null
    if (!clickedId) return
    const clickedIdx = indexOfBlockId(view.state.doc, clickedId)
    if (clickedIdx < 0) {
      // In-column block (Phase 2, Task 4 F3): not a root child, so the
      // root-only id→index lookup misses it. Build a column-LOCAL MBS on its
      // own surface + toggle/open the dropdown. Task 5: shift-extend is
      // column-local when the anchor is on the same column surface; otherwise
      // a fresh single-block MBS (never cross-surface). Uses the mousedown
      // snapshot (same reasoning as the root path: DOMObserver may have
      // cleared current state between mousedown and mouseup).
      applyInColumnGripClick(view, opts.blockPos, clickedId, opts.shiftKey, opts.snapshot)
      return
    }

    // Use the mousedown-time snapshot, not view.state, for decision-
    // making. Between mousedown and now (mouseup), PM's DOMObserver may
    // have dispatched a pointer-tagged TextSelection from a focus-
    // shuffle override, clearing both MBS and anchorBlockId. Honouring
    // current state would mean a user clicking a grip on an already-
    // selected block sees their selection re-set instead of toggled off.
    const snapSel = opts.snapshot.sel
    const anchorId = opts.snapshot.anchorBlockId

    // Click on a block already inside the MBS (single OR multi). Per spec
    // §1.1: grip is the dropdown trigger; MBS persists across grip
    // re-clicks. Don't touch the selection — just toggle the dropdown.
    // Use snapshot.dropdownBlockId because Radix's onPointerDownOutside
    // fires on pointerdown (before our mousedown), and by mouseup
    // view.state.dropdownBlockId is already null. The snapshot captures
    // the user-visible state at press time. (Radix's auto-close is
    // separately suppressed in BlockActionsDropdown's
    // onPointerDownOutside handler so the grip remains the single
    // arbiter of dropdown lifecycle.)
    if (
      !opts.shiftKey &&
      snapSel instanceof MultiBlockSelection &&
      clickedIdx >= snapSel.blockIndices[0] &&
      clickedIdx <= snapSel.blockIndices[1]
    ) {
      const wasOpen = opts.snapshot.dropdownBlockId === clickedId
      const [lo, hi] = snapSel.blockIndices
      view.dispatch(
        view.state.tr
          .setSelection(MultiBlockSelection.create(view.state.doc, lo, hi))
          .setMeta(blockSelectionKey, {
            ...(wasOpen
              ? { closeDropdown: true as const }
              : { openDropdownFor: clickedId }),
            setAnchor: anchorId,
          }),
      )
      return
    }

    let tr = view.state.tr

    if (opts.shiftKey && anchorId) {
      const anchorIdx = indexOfBlockId(view.state.doc, anchorId)
      if (anchorIdx < 0) {
        // Anchor block was deleted — fall back to single-block.
        tr = tr
          .setSelection(MultiBlockSelection.create(view.state.doc, clickedIdx, clickedIdx))
          .setMeta(blockSelectionKey, {
            setAnchor: clickedId,
            openDropdownFor: clickedId,
          })
      } else {
        tr = tr
          .setSelection(MultiBlockSelection.create(view.state.doc, anchorIdx, clickedIdx))
          .setMeta(blockSelectionKey, { openDropdownFor: clickedId })
      }
    } else {
      // Plain click on a block outside any active MBS. Span the chain
      // range if dragSourceRange supplied one — list / toggle subtrees
      // get the same multi-block visual the drag path would pick up.
      // Anchor stays on the gripped block so subsequent shift-extend
      // pivots from the user-clicked target, not the chain tail.
      const [lo, hi] = chainIndexBounds(view.state.doc, clickedIdx, opts.range)
      tr = tr
        .setSelection(MultiBlockSelection.create(view.state.doc, lo, hi))
        .setMeta(blockSelectionKey, {
          setAnchor: clickedId,
          openDropdownFor: clickedId,
        })
    }

    view.dispatch(tr)
  }

  return new Plugin<BlockSelectionPluginState>({
    key: blockSelectionKey,
    state: {
      init: () => INITIAL,
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(blockSelectionKey) as BlockSelectionPluginMeta | undefined

        // Compute next dropdownBlockId. Order matters: explicit close beats open;
        // doc-change auto-clear runs last so a setMeta in the same tr wins.
        let nextDropdown = prev.dropdownBlockId
        let nextDropdownAnchor = prev.dropdownAnchor
        if (meta?.openDropdownFor) {
          nextDropdown = meta.openDropdownFor
          nextDropdownAnchor = meta.dropdownAnchor ?? "grip"
        }
        if (meta?.closeDropdown) nextDropdown = null
        if (tr.docChanged && nextDropdown) {
          // Surface-agnostic existence check: an in-column dropdown's block id
          // is NOT a root child, so the root-only indexOfBlockId would report
          // it gone on the first background docChanged tr (e.g. a BlockId
          // backfill elsewhere) and prematurely close the dropdown.
          if (resolveBodyBlockById(newState.doc, nextDropdown) == null) nextDropdown = null
        }
        if (nextDropdown === null) nextDropdownAnchor = "grip"

        // Selection transition clears anchor if we're no longer in block mode.
        const inBlockMode = newState.selection instanceof MultiBlockSelection
        if (!inBlockMode) {
          return {
            anchorBlockId: null,
            dropdownBlockId: nextDropdown,
            dropdownAnchor: nextDropdownAnchor,
          }
        }

        // Explicit meta wins (covers null-clear and id-set).
        if (meta && "setAnchor" in meta) {
          return {
            anchorBlockId: meta.setAnchor ?? null,
            dropdownBlockId: nextDropdown,
            dropdownAnchor: nextDropdownAnchor,
          }
        }

        // Otherwise, preserve existing anchor — shift-extend path.
        return {
          anchorBlockId: prev.anchorBlockId,
          dropdownBlockId: nextDropdown,
          dropdownAnchor: nextDropdownAnchor,
        }
      },
    },
    view(view) {
      // Initial-mount selection normalization. PM's EditorState.create
      // defaults selection to Selection.atStart(doc), which lands a
      // NodeSelection on a selectable leaf atom (e.g. divider) when it
      // is the first block — PM then auto-applies
      // .ProseMirror-selectednode and the atom paints as if selected on
      // a fresh, never-interacted-with editor. Same root cause as the
      // outside-click dismissal bug below; different entry point.
      //
      // Mirrors the textOnly bias used in onOutsidePointerDown. Bail on
      // an all-atom doc (degenerate case — no textblock to host the
      // caret) and on equal-selection no-ops to keep this a one-shot.
      {
        const sel = view.state.selection
        if (sel instanceof NodeSelection && sel.from === 0 && sel.node.isAtom) {
          const next = Selection.findFrom(view.state.doc.resolve(0), 1, true)
          if (next && !next.eq(sel)) {
            view.dispatch(view.state.tr.setSelection(next))
          }
        }
      }

      viewToApi.set(view, {
        snapshotForGripDown: () => {
          const ps = blockSelectionKey.getState(view.state)
          return {
            sel: view.state.selection,
            anchorBlockId: ps?.anchorBlockId ?? null,
            dropdownBlockId: ps?.dropdownBlockId ?? null,
          }
        },
        applyGripClick: (opts) => applyGripClick(view, opts),
      })

      // Document-level outside-click dismissal. Clicking anywhere off the
      // selected blocks — page background, host chrome, other panels —
      // clears MBS. PM only sees events inside .ProseMirror, and our
      // wrapper listeners only see .rune-editor; without this hook, MBS
      // could only be dismissed by clicks landing on those two surfaces.
      //
      // Bails when the target is inside ANY .rune-block (PM owns those —
      // its own click handling will dispatch a TextSelection, which the
      // apply rule above converts into an anchor clear), inside a Radix
      // portal (slash menu, format toolbar — these operate ON the current
      // MBS and must not dismiss it), inside the block-actions dropdown
      // (which is a plain `<div>` sibling of `.rune-editor`, NOT a Radix
      // portal — its onClick handlers read MBS from React state and would
      // bail with `firstPos === null` if pointerdown cleared MBS first),
      // inside the side-menu grip (its own gesture machine), or inside a
      // DIFFERENT .rune-editor (nested-editor isolation).
      const ownerDoc = view.dom.ownerDocument
      const ownEditor = (): Element | null => view.dom.closest(".rune-editor")
      const onOutsidePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return
        const selection = view.state.selection
        const isMBS = selection instanceof MultiBlockSelection
        // NodeSelection on a top-level block (equation, divider, image…)
        // shows the same "selected background" affordance, and PM's own
        // click-outside detection only fires for clicks landing in
        // .ProseMirror. Without a NodeSelection branch here, clicking
        // the left/right gutter or page chrome leaves the blue bg stuck.
        const isBlockNodeSel =
          selection instanceof NodeSelection &&
          selection.$from.depth === 0
        if (!isMBS && !isBlockNodeSel) return
        if (!(event.target instanceof Element)) return
        const target = event.target
        if (target.closest(".rune-block")) return
        if (target.closest("[data-radix-popper-content-wrapper]")) return
        if (target.closest("[data-rune-block-actions-content]")) return
        if (target.closest(".rune-side-menu-grip")) return
        const own = ownEditor()
        const targetEditor = target.closest(".rune-editor")
        if (targetEditor && targetEditor !== own) return

        // `selection.from` IS the absolute boundary before the first selected
        // block for BOTH branches — an MBS's `from` sits before its first
        // block on the selection's OWN surface (root or column), and a
        // NodeSelection's `from` sits before the node. The old MBS branch fed
        // the SURFACE-LOCAL blockIndices[0] into the root-indexed
        // topLevelBlockStartPos, which crashed with a RangeError (column-local
        // index beyond doc.childCount — thrown from this capture-phase
        // listener, so the MBS never dismissed) or resolved the wrong ROOT
        // block (caret teleported to the top of the doc).
        const $start = view.state.doc.resolve(selection.from)
        // textOnly=true skips selectable atoms (e.g. divider). Without it,
        // dismissing MBS whose first block is a divider lands a NodeSelection
        // on the divider — PM auto-applies .ProseMirror-selectednode and the
        // divider keeps the selected background. Fall back to Selection.near
        // only if the doc has no textblock at all (degenerate all-atom case).
        const sel = Selection.findFrom($start, 1, true) ?? Selection.near($start, 1)
        view.dispatch(
          view.state.tr.setSelection(sel).setMeta(blockSelectionKey, { setAnchor: null }),
        )
      }
      ownerDoc.addEventListener("pointerdown", onOutsidePointerDown, true)

      return {
        destroy() {
          ownerDoc.removeEventListener("pointerdown", onOutsidePointerDown, true)
          viewToApi.delete(view)
        },
      }
    },
    props: {
      decorations(state) {
        const sel = state.selection
        // Suppress the outline while a block-drag is active. gesture.ts
        // commits MBS only on a release-without-threshold-cross (single
        // entry point), so a fresh click-then-drag never reaches here
        // with MBS set. But dragging a block that was *already* part of
        // an existing MBS does, and without this gate the source block
        // would keep its blue outline through the drag — both at the
        // original spot and (via the cloned source DOM) on the preview.
        if (isDragging(state)) return null

        // Only MultiBlockSelection paints block chrome. Cross-block
        // TextSelection (e.g. text-drag across blocks) is left to browser-
        // native ::selection — Notion's behavior, confirmed via manual
        // smoke test for issue #103. Block tinting is reserved for explicit
        // MBS entry points (Cmd+A, padding-click, grip click, Esc, etc.).
        if (!(sel instanceof MultiBlockSelection)) return null

        const decos: Decoration[] = []
        const [lo, hi] = sel.blockIndices
        // Surface-aware paint (Phase 2): walk the MBS's OWN surface, not the
        // doc root. For a root MBS `surface` is the doc and `surfaceStart` is
        // 0 — behavior-identical to the old `topLevelBlockStartPos` path. For a
        // column-local MBS the indices/positions are column-relative, so a
        // doc-level `state.doc.child(i)` would crash / mis-tint. (Keyboard /
        // marquee surface rules are Task 5; this paint generalization is the
        // minimum the in-column grip-click MBS needs.)
        const surfaceNode = sel.surface
        const surfaceStart =
          surfaceNode === state.doc
            ? topLevelBlockStartPos(state.doc, lo)
            : (() => {
                // Absolute start of block `lo` within the surface.
                const contentStart = sel.$anchor.start(sel.$anchor.depth)
                let p = contentStart
                for (let i = 0; i < lo; i++) p += surfaceNode.child(i).nodeSize
                return p
              })()
        let pos = surfaceStart
        for (let i = lo; i <= hi; i++) {
          const node = surfaceNode.child(i)
          decos.push(
            Decoration.node(pos, pos + node.nodeSize, {
              "data-block-selected": "true",
            }),
          )
          pos += node.nodeSize
        }
        return DecorationSet.create(state.doc, decos)
      },
      handleKeyDown: (view, event) => {
        if (!(view.state.selection instanceof MultiBlockSelection)) return false
        if (event.ctrlKey || event.metaKey || event.altKey) return false
        // Named keys (Backspace, Delete, Enter, Arrow*, …) are handled by
        // Tiptap's keymap. We only swallow plain printable single-char keys.
        if (event.key.length !== 1) return false
        event.preventDefault()
        return true
      },
    },
  })
}

export { indexOfBlockId, positionOfBlockId }
