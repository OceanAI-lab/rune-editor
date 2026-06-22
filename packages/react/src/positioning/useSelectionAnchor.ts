// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useCallback, useRef } from "react"
import type { Editor } from "@tiptap/core"

import { editorViewDom, pointAnchorAtHead, type PointAnchorOptions, type RuneAnchor } from "./anchors"

/**
 * Lazy anchor at a text selection's head — the ergonomic hook form of
 * `pointAnchorAtHead`, with the last-good-rect fallback baked in. Returns a
 * stable `() => DOMRect | null` getter to feed straight into
 * `useStableVirtualElement`.
 *
 * `range` is the captured selection (`from`/`to`/`head`); pass null when there's
 * no active anchor (the getter then yields the last good rect, or null before
 * any). `opts.height` selects the point shape ("zero" point vs full selection
 * height — see PointAnchorOptions). On a failed live read (coordsAtPos throws,
 * mid-close) the getter falls back to the last rect it successfully measured, so
 * the popover doesn't jump to the corner during a transient.
 */
export function useSelectionAnchor(
  editor: Editor | null,
  range: { from: number; to: number; head: number } | null,
  opts: PointAnchorOptions = {},
): RuneAnchor {
  const lastRectRef = useRef<DOMRect | null>(null)
  const height = opts.height
  // Depend on the primitive fields, not the `range` object identity, so a caller
  // passing a fresh literal each render doesn't churn the getter needlessly.
  const from = range?.from ?? null
  const to = range?.to ?? null
  const head = range?.head ?? null
  const anchor = useCallback<RuneAnchor>(() => {
    if (!editor || editor.isDestroyed || from == null || to == null || head == null) {
      return lastRectRef.current
    }
    const rect = pointAnchorAtHead(editor.view, from, to, head, { height })
    if (rect) lastRectRef.current = rect
    return rect ?? lastRectRef.current
  }, [editor, from, to, head, height])
  // Tag with the editor DOM so floating-ui re-positions on inner-container
  // scroll, not just window. See useBlockAnchor / RuneAnchor JSDoc.
  anchor.contextElement = editorViewDom(editor)
  return anchor
}
