// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { EditorView } from "@tiptap/pm/view"

/** Register a `mousedown` listener on the nearest matching ancestor of
 *  `view.dom`. Returns an unregister function.
 *
 *  Why this exists: extensions that need wrapper-scoped clicks (drag-extend
 *  entry B, padding-drag reorder, future editor-out marquee) must listen on
 *  an editor ancestor rather than on `document` (issue #100) and rather than
 *  on `view.dom` (gutter clicks miss). But at `plugin.view()` time the PM dom
 *  may not yet be inside its target ancestor — `@tiptap/react`'s
 *  `EditorContent` mounts `view.dom` via `useEffect`, after PM plugins'
 *  `view()` has already run. Eager `view.dom.closest(selector)` returns
 *  `null` in that case and the listener silently lands on `view.dom` for the
 *  lifetime of the view.
 *
 *  This helper:
 *   - Registers synchronously when `view.dom` is already inside the selector
 *     (covers tests using `Editor({ element })` and any non-React mount that
 *     attaches before `view()` runs).
 *   - Otherwise defers registration via `requestAnimationFrame` so React's
 *     mount effect has run by the time we resolve the wrapper.
 *   - Falls back to `view.dom` if no matching ancestor ever exists, so
 *     non-Rune mounts still receive events instead of silently no-op'ing.
 */
function onAncestorMouseDown(
  view: EditorView,
  selector: string,
  handler: (e: MouseEvent) => void,
): () => void {
  let target: HTMLElement | null = null
  let cancelled = false

  const install = () => {
    if (cancelled) return
    const root = view.dom.closest(selector)
    target = root instanceof HTMLElement ? root : (view.dom as HTMLElement)
    target.addEventListener("mousedown", handler)
  }

  if (view.dom.closest(selector)) {
    install()
  } else {
    requestAnimationFrame(install)
  }

  return () => {
    cancelled = true
    target?.removeEventListener("mousedown", handler)
    target = null
  }
}

export function onEditorWrapperMouseDown(
  view: EditorView,
  handler: (e: MouseEvent) => void,
): () => void {
  return onAncestorMouseDown(view, ".rune-editor", handler)
}
