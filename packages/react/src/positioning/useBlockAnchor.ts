// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useCallback, useRef } from "react"
import type { Editor } from "@tiptap/core"

import { editorViewDom, unionBlockRect, type RuneAnchor } from "./anchors"

// NUL separator: it can't appear in a block id, so the join/split round-trip
// used to stabilize the callback identity is lossless. Built via fromCharCode
// so the source stays pure-ASCII (no control char in the file).
const KEY_SEP = String.fromCharCode(0)

/**
 * Lazy anchor over one or more blocks (by `data-id`) — the ergonomic hook form
 * of `unionBlockRect`, with the last-good-rect fallback baked in. Returns a
 * stable `() => DOMRect | null` getter for `useStableVirtualElement`.
 *
 * Pass a single id, an array (anchors the union bbox — e.g. the first and last
 * block of a multi-block selection), or null when there's no anchor. Ids whose
 * element isn't in the DOM are dropped; a failed read falls back to the last
 * good rect. The getter identity only changes when the ids actually change, not
 * on every render's new array literal.
 */
export function useBlockAnchor(
  editor: Editor | null,
  blockIds: string | string[] | null,
): RuneAnchor {
  const lastRectRef = useRef<DOMRect | null>(null)
  const ids =
    blockIds == null ? [] : Array.isArray(blockIds) ? blockIds : [blockIds]
  const key = ids.join(KEY_SEP)
  const anchor = useCallback<RuneAnchor>(() => {
    if (!editor || editor.isDestroyed || key === "") return lastRectRef.current
    const rect = unionBlockRect(editor.view, key.split(KEY_SEP))
    if (rect) lastRectRef.current = rect
    return rect ?? lastRectRef.current
  }, [editor, key])
  // Tag the anchor with the editor DOM so floating-ui's autoUpdate finds the
  // rect's real scroll ancestors (an inner overflow:auto host), not just window
  // — otherwise the popover detaches on inner-container scroll. Idempotent
  // assignment on a [editor,key]-stable callback. See RuneAnchor JSDoc.
  anchor.contextElement = editorViewDom(editor)
  return anchor
}
