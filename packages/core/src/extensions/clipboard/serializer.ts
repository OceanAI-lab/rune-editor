// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import { DOMSerializer } from "@tiptap/pm/model"
import type { Node as ProseMirrorNode, DOMOutputSpec } from "@tiptap/pm/model"
import { forEachBlockSpec } from "../../schema/blocks/registry"

/**
 * Build a DOMSerializer used exclusively for clipboard `text/html` output.
 * Each rune-managed block uses its `clipboardRenderDOM` if declared,
 * otherwise falls back to `renderDOM` (which produces the editor-chrome
 * wrapper — acceptable but not ideal). Non-rune nodes (text, hardBreak,
 * Tiptap built-ins like horizontalRule) and ALL marks use the schema's
 * default `toDOM` via `DOMSerializer.fromSchema`.
 *
 * Wired as the plugin's `clipboardSerializer` prop; PM's
 * `serializeForClipboard` reads that prop and uses this serializer
 * instead of the schema default.
 */
export function buildClipboardSerializer(editor: Editor): DOMSerializer {
  const nodes: Record<string, (node: ProseMirrorNode) => DOMOutputSpec> = {}
  forEachBlockSpec(editor, (nodeName, meta) => {
    // Explicit branch: clipboardRenderDOM has a deliberately narrower
    // signature than renderDOM (no HTMLAttributes), expressing "this
    // path NEVER carries chrome attrs". Don't collapse the two by
    // passing {} — keep the contract visible at the call site.
    nodes[nodeName] = meta.clipboardRenderDOM
      ? (node) => meta.clipboardRenderDOM!({ node })
      : (node) => meta.renderDOM!({ node, HTMLAttributes: {} })
  })
  // Structural nodes (NOT block specs, so no `__runeBlockSpec` marker —
  // e.g. `column`) can still opt into a chrome-free clipboard form by
  // declaring `clipboardDOM` in their `Node.create` config. Tiptap does
  // NOT copy unknown config fields onto the PM NodeSpec, so read it off
  // the extension config here. This lets a structural wrapper degrade to
  // a bare element (no data-* attrs / rune classes) when copied, without
  // becoming a body block.
  const structuralClipboardDOM: Record<
    string,
    (node: ProseMirrorNode) => DOMOutputSpec
  > = {}
  for (const ext of editor.extensionManager.extensions) {
    const fn = (ext.config as {
      clipboardDOM?: (node: ProseMirrorNode) => DOMOutputSpec
    }).clipboardDOM
    if (typeof fn === "function") structuralClipboardDOM[ext.name] = fn
  }

  const fallback = DOMSerializer.fromSchema(editor.schema)
  for (const name of Object.keys(editor.schema.nodes)) {
    if (name in nodes) continue
    const clipboardDOM = structuralClipboardDOM[name]
    if (clipboardDOM) {
      nodes[name] = (node) => clipboardDOM(node)
      continue
    }
    const fn = fallback.nodes[name]
    if (fn) nodes[name] = fn
  }
  return new DOMSerializer(nodes, fallback.marks)
}
