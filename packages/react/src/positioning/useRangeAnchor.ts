// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useCallback, useRef } from "react"
import type { Editor } from "@tiptap/core"

import { editorViewDom, rangeToRect, type RuneAnchor } from "./anchors"

/**
 * Lazy anchor over a text range — the ergonomic hook form of `rangeToRect`, with
 * the last-good-rect fallback and the inner-scroll `contextElement` baked in.
 * Returns a stable `() => DOMRect | null` getter to feed straight into
 * `useStableVirtualElement`.
 *
 * `range` is the anchored range (`from`/`to`, e.g. a link mark's extent); pass
 * null when there's no active anchor (the getter then yields the last good rect,
 * or null before any). On a failed live read (coordsAtPos throws mid-close) the
 * getter falls back to the last rect it successfully measured. The link hover
 * card and the paste-link menu both pin to a mark range's bounding box.
 */
export function useRangeAnchor(
  editor: Editor | null,
  range: { from: number; to: number } | null,
): RuneAnchor {
  const lastRectRef = useRef<DOMRect | null>(null)
  // Depend on the primitive fields, not the `range` object identity, so a caller
  // passing a fresh literal each render doesn't churn the getter needlessly.
  const from = range?.from ?? null
  const to = range?.to ?? null
  const anchor = useCallback<RuneAnchor>(() => {
    if (!editor || editor.isDestroyed || from == null || to == null) {
      return lastRectRef.current
    }
    const rect = rangeToRect(editor.view, from, to)
    if (rect) lastRectRef.current = rect
    return rect ?? lastRectRef.current
  }, [editor, from, to])
  // Tag with the editor DOM so floating-ui re-positions on inner-container
  // scroll, not just window. See useBlockAnchor / RuneAnchor JSDoc.
  anchor.contextElement = editorViewDom(editor)
  return anchor
}
