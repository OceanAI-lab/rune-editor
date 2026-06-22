// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useEffect, useState, type ReactNode, type CSSProperties } from "react"
import type { Editor } from "@tiptap/core"
import { setMarqueeZone } from "@ocai/rune-core"

export interface RuneMarqueeZoneProps {
  /** The editor whose marquee block-selection zone this region defines. */
  editor: Editor | null
  /** Children rendered inside the zone div. */
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * Widens the marquee block-selection zone to a host-owned region. By
 * default the editor already marquees within its own `.rune-editor`
 * padding; use this component when the marquee should also cover area
 * OUTSIDE the editor — e.g. a page wrapper containing both the
 * document title and `<RuneEditor>`, so dragging from gutters next to
 * either still triggers MBS.
 *
 * Mounting replaces the default `.rune-editor` zone with the wrapped
 * div; unmounting reverts to the default. The wrapped div MUST be a
 * DOM ancestor of `editor.view.dom` so event bubbling reaches the
 * listener. Mark toolbar-like chrome inside the zone with
 * `data-rune-marquee-skip` if it should not start marquee. Renders a
 * plain `<div>` with no built-in styling — pass className/style to lay
 * it out yourself.
 */
export function RuneMarqueeZone(props: RuneMarqueeZoneProps) {
  const { editor, children, className, style } = props
  // Callback ref tracked via state so the registration effect re-runs
  // when either editor or the DOM node becomes available — useRef
  // alone won't re-fire when ref.current binds AFTER `editor` flips
  // non-null, which a host that hands `editor` over asynchronously
  // (e.g. queueMicrotask(setEditor) inside onReady) can trigger under
  // React 19 + React Compiler. See PR #268.
  const [el, setEl] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!editor || !el) return
    return setMarqueeZone(editor, el)
  }, [editor, el])

  return (
    <div ref={setEl} className={className} style={style}>
      {children}
    </div>
  )
}
