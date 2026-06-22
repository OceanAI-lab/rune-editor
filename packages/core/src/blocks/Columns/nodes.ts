// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Node } from "@tiptap/core"
import { DOMSerializer } from "@tiptap/pm/model"
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { ViewMutationRecord } from "@tiptap/pm/view"

// `clipboardDOM` is a Rune-specific NodeSpec extension consumed by
// buildClipboardSerializer for STRUCTURAL nodes (no `__runeBlockSpec`
// marker, so not covered by the block-spec `clipboardRenderDOM` path).
// Declare the augmentation so it's a known NodeConfig field. Mirrors how
// Table/nodes.ts augments NodeConfig with `tableRole`.
declare module "@tiptap/core" {
  interface NodeConfig {
    clipboardDOM?: (node: ProseMirrorNode) => DOMOutputSpec
  }
}

/**
 * Pure NodeView ignoreMutation predicate for `column` (exported for unit
 * tests). `true` ⇒ PM's DOMObserver discards the mutation instead of
 * redrawing.
 *
 * Why this exists: column-resize's live preview writes inline
 * `--rune-col-width` onto the column DOM node mid-drag. Without a custom
 * NodeView, the column renders as a plain ViewDesc whose default
 * `ignoreMutation` returns `false` for any node WITH a contentDOM — so the
 * first preview write made the DOMObserver redraw the layout subtree,
 * detaching the gesture's cached elements and killing the preview (real
 * browsers only; jsdom never flushes this path). Attribute mutations on the
 * column root are safe to ignore wholesale: PM cannot parse attribute
 * changes back into the doc anyway, and PM's OWN attr updates happen while
 * the observer is suspended. Content (`childList` on descendants /
 * `characterData`) and selection probes must still reach PM — but those
 * resolve to the CHILD descs' ignoreMutation, not this one; the predicate
 * still answers `false` for them for the rare case where the column root
 * itself is the mutation target (e.g. a direct child removed by the
 * browser).
 */
export function shouldIgnoreColumnMutation(
  mutation: Pick<ViewMutationRecord, "type">,
): boolean {
  return mutation.type === "attributes"
}

/**
 * Single source of truth for the column's DOM shape — shared by
 * `renderHTML` (SSR / getHTML / parse round-trips) and the NodeView below,
 * so the two surfaces can never drift. The `0` hole doubles as the
 * NodeView's contentDOM (root element IS the content container).
 */
function columnDOMSpec(HTMLAttributes: Record<string, unknown>): DOMOutputSpec {
  return ["div", { ...HTMLAttributes, "data-rune-column": "", class: "rune-column" }, 0]
}

// `column` is a STRUCTURAL node hand-rolled via Node.create, following
// the Table-internals precedent (blocks/Table/nodes.ts). It deliberately
// does NOT go through createBlockSpec, so:
//   - it carries no `id`/`depth` factory attrs (its own `id` is a plain
//     structural attr, distinct from a body block's tracked id),
//   - it carries no `__runeBlockSpec` storage marker, so it is invisible
//     to getDocument / side-menu / MBS / drag / slash-menu,
//   - it is NOT in BlockId.types (deriveBlockIdTypes filters by the
//     marker), so the block-id plugin never backfills it. Column ids are
//     backfilled by Columns/normalization.ts (Task 2).
//
// Unlike table cells, a column's content is `block+` — its children are
// FIRST-CLASS page-body blocks (paragraphs, headings, lists, …). That is
// the entire point of columns and the difference from tables.
//
// parseDOM is parent-scoped (mirror of TableParagraph): the rule only
// claims a `<div data-rune-column>` when it sits directly inside a
// `columnLayout` wrapper, so a stray column-like div in pasted HTML can't
// hijack page-body content.
export const Column = Node.create({
  name: "column",
  content: "block+",
  // isolating keeps editing operations (backspace/delete at boundaries,
  // selection) from spilling across the column boundary — the same guard
  // table cells use. Backspace-at-column-start no-op (Task 6) builds on
  // top of this.
  isolating: true,

  addAttributes() {
    return {
      id: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-col-id"),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.id ? { "data-col-id": attrs.id as string } : {},
      },
      width: {
        // Ratio (flex-grow proportion). Default 1 = equal share.
        // Normalization (Task 2) clamps non-positive / missing to 1.
        default: 1,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute("data-col-width")
          const n = raw == null ? 1 : Number.parseFloat(raw)
          return Number.isFinite(n) && n > 0 ? n : 1
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          // Defensive: render a valid CSS var regardless of stored attr.
          // Task 2's appendTransaction clamps the stored width, but until
          // then (or for the frame before it runs) a programmatically set
          // 0/-n/NaN must not emit a broken `--rune-col-width`.
          const w =
            typeof attrs.width === "number" &&
            Number.isFinite(attrs.width) &&
            attrs.width > 0
              ? attrs.width
              : 1
          return {
            "data-col-width": String(w),
            // Inline CSS var consumed by the flex layout (the actual flex
            // CSS lands in Task 9 / react styles). Emitted here so widths
            // survive HTML round-trips and SSR.
            style: `--rune-col-width: ${w};`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-rune-column]",
        getAttrs: (el: HTMLElement | string) => {
          if (typeof el === "string") return false
          const parent = el.parentElement
          if (!parent) return false
          // Only claim a column div that lives directly inside a
          // columnLayout wrapper. Symmetric to TableParagraph's parent
          // check — keeps page-body divs from being parsed as columns.
          return parent.hasAttribute("data-rune-columns") ? null : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return columnDOMSpec(HTMLAttributes)
  },

  // Minimal live NodeView whose ONLY job is `ignoreMutation` (see the
  // predicate's JSDoc — resize's inline preview writes must not trigger a
  // DOMObserver redraw). NOT placed on `columnLayout`: DOMObserver consults
  // only the NEAREST desc of the mutation target (`registerMutation` →
  // `docView.nearestDesc(mut.target)`), and the mutated elements are the
  // COLUMN nodes, which carry their own descs — a layout-level NodeView is
  // never asked. The root is rendered from the SAME spec as renderHTML
  // (attrs merge / class parity guaranteed; probed in nodes.test.ts), and
  // doubles as contentDOM. No `update` method on purpose: PM then falls
  // back to the standard sameMarkup path — in-place children updates,
  // recreate on attr change — i.e. exactly the plain-desc semantics this
  // node had before, plus the mutation filter.
  addNodeView() {
    return ({ HTMLAttributes }) => {
      const { dom, contentDOM } = DOMSerializer.renderSpec(
        document,
        columnDOMSpec(HTMLAttributes),
      )
      return {
        dom: dom as HTMLElement,
        contentDOM: (contentDOM ?? dom) as HTMLElement,
        ignoreMutation: shouldIgnoreColumnMutation,
      }
    }
  },

  // Clipboard text/html: degrade to a bare <div> holding the column's
  // children — NO data-col-* attrs, NO rune-column class. Picked up by
  // buildClipboardSerializer (which honours a node spec's `clipboardDOM`
  // for structural nodes that aren't body-block specs). Combined with
  // columnLayout.clipboardRenderDOM (also a bare <div>), a copied layout
  // serializes as a flat, chrome-free block sequence that pastes cleanly
  // into Notion / TextEdit / GitHub.
  clipboardDOM: () => ["div", {}, 0],
})
