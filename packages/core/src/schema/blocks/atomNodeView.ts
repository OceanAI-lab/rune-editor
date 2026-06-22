// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import { DOMSerializer } from "@tiptap/pm/model"
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Decoration } from "@tiptap/pm/view"
import { buildResizeHandles } from "../../extensions/resize/widget"
import { buildWidget } from "../../extensions/side-menu/widget"
import { getBlockSpecs } from "./registry"

export interface AtomNodeViewArgs {
  node: ProseMirrorNode
  editor: Editor
  getPos: () => number | undefined
  decorations: readonly Decoration[]
  HTMLAttributes: Record<string, unknown>
  renderDOM: (args: {
    node: ProseMirrorNode
    HTMLAttributes: Record<string, unknown>
  }) => DOMOutputSpec
}

export interface AtomNodeView {
  dom: HTMLElement
  update(updatedNode: ProseMirrorNode, decos: readonly Decoration[]): boolean
  ignoreMutation(): boolean
  stopEvent?(event: Event): boolean
  destroy?(): void
}

function isSideMenuActive(decos: readonly Decoration[]): boolean {
  return decos.some((d) => d.spec?.key === "rune-side-menu")
}

/**
 * Mount or clear the side-menu widget inside an atom block's
 * `.rune-side-menu-host` based on whether the side-menu decoration is
 * currently active on this block. Exported so consumer-provided
 * NodeViews (e.g. the React-backed equation block) can keep the same
 * sync semantics that `createAtomNodeView` gets for free — without
 * reimplementing the side-menu decoration key or the widget builder.
 */
export function syncMenuSlot(
  host: HTMLElement,
  decos: readonly Decoration[],
  editor: Editor,
  getPos: () => number | undefined,
): void {
  const active = isSideMenuActive(decos)
  if (active && host.children.length === 0) {
    host.appendChild(buildWidget(getPos, editor))
  } else if (!active && host.children.length > 0) {
    host.replaceChildren()
  }
}

export function syncResizeSlot(
  host: HTMLElement,
  root: HTMLElement,
  node: ProseMirrorNode,
  editor: Editor,
): void {
  // Both the capability flag and the media selector are spec-declared
  // (`supports.resize` + `resizeMediaSelector`) — core carries no list of
  // media DOM shapes. No selector match (e.g. an empty-state placeholder)
  // means no handles.
  const spec = getBlockSpecs(editor)[node.type.name]
  const selector = spec?.supports?.resize === true ? spec.resizeMediaSelector : undefined
  const active =
    editor.isEditable && selector != null && root.querySelector(selector) !== null

  if (active && host.children.length === 0) {
    host.replaceChildren(...buildResizeHandles())
  } else if (!active && host.children.length > 0) {
    host.replaceChildren()
  }
}

export function createAtomNodeView(args: AtomNodeViewArgs): AtomNodeView {
  const { node, editor, getPos, decorations, HTMLAttributes, renderDOM } = args

  const spec = renderDOM({ node, HTMLAttributes })
  const { dom: rendered } = DOMSerializer.renderSpec(document, spec)
  const root = rendered as HTMLElement
  if (!root.classList.contains("rune-block")) {
    throw new Error(
      `[rune] atom block "${node.type.name}": renderDOM must produce an outer ".rune-block" element`,
    )
  }

  const host = document.createElement("div")
  host.className = "rune-side-menu-host"
  root.appendChild(host)

  const resizeContent = root.querySelector<HTMLElement>(
    ":scope > .rune-block-content",
  )
  const resizeHost = document.createElement("div")
  resizeHost.className = "rune-resize-host"
  if (resizeContent) resizeContent.appendChild(resizeHost)

  // Best-effort seed. During Tiptap bootstrap, active decorations arrive
  // through the synchronous update() after plugin reconfigure.
  syncMenuSlot(host, decorations, editor, getPos)
  if (resizeContent) syncResizeSlot(resizeHost, root, node, editor)

  let currentNode = node

  // Attr diffs the live NodeView can absorb without a rebuild are declared
  // per block (`BlockSpecConfig.inPlaceAttrs`); anything else (src,
  // dimensions, …) recreates the view. Absorption is what lets chrome
  // portaled inside this DOM (the media floating bar) survive e.g. an
  // alignment click — a rebuild would unmount it mid-interaction.
  // Returning false discards the whole DOM, so writes a pair already made
  // before a later attr forces the rebuild are harmless.
  //
  // Spec metadata is static for the editor's lifetime and node.type fixed
  // per view, so capture the declarations once instead of rebuilding the
  // registry record on every attrs-changed update.
  const declared = getBlockSpecs(editor)[node.type.name]?.inPlaceAttrs
  function absorbAttrChange(next: ProseMirrorNode): boolean {
    for (const key of Object.keys(next.attrs)) {
      if (currentNode.attrs[key] === next.attrs[key]) continue
      const pair = declared?.find((p) => p.attr === key)
      if (!pair) return false
      const applied = pair.applyToDOM(
        { root, content: resizeContent },
        next.attrs[key],
      )
      if (applied === false) return false
    }
    // No differing key is a value-equal attrs rewrite (PM's AttrStep always
    // builds a fresh attrs object, e.g. re-clicking the pressed alignment
    // option) — absorb it regardless of declarations; rebuilding would
    // unmount portaled chrome.
    return true
  }

  return {
    dom: root,
    update(updatedNode, decos) {
      if (updatedNode.type !== node.type) return false
      if (updatedNode.attrs !== currentNode.attrs) {
        if (!absorbAttrChange(updatedNode)) return false
        currentNode = updatedNode
      }
      syncMenuSlot(host, decos, editor, getPos)
      if (resizeContent) syncResizeSlot(resizeHost, root, updatedNode, editor)
      return true
    },
    ignoreMutation() {
      return true
    },
    // React chrome (e.g. the media floating bar) can be portaled INSIDE
    // this NodeView's DOM. Without this, PM would treat clicks on its
    // buttons as editor input (caret moves / node selection) before
    // React's delegated handlers ever run. Keyed on the generic chrome
    // marker so any portaled chrome is covered without editing core.
    // Drag events stay with PM: stopping them would skip both PM's
    // dragover preventDefault and the media import-plugin's drop handler,
    // making a file drop over the chrome navigate the page.
    stopEvent(event: Event) {
      if (event.type.startsWith("drag") || event.type === "drop") return false
      const target = event.target
      return (
        target instanceof Element &&
        target.closest("[data-rune-editor-chrome]") !== null
      )
    },
  }
}
