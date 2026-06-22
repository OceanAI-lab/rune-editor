// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useEffect } from "react"
import type { Editor } from "@tiptap/core"
import type { OpenRuneRef } from "./types"

export interface UseInternalRefClickOptions {
  editor: Editor | null
  openRef?: OpenRuneRef
}

export function useInternalRefClick({
  editor,
  openRef,
}: UseInternalRefClickOptions): void {
  useEffect(() => {
    if (!editor || !openRef) return
    const root = editor.view.dom
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const anchor = target?.closest("a[data-rune-ref-kind][data-rune-ref-target]")
      if (!anchor || !root.contains(anchor)) return
      const kind = anchor.getAttribute("data-rune-ref-kind") ?? ""
      const refTarget = anchor.getAttribute("data-rune-ref-target") ?? ""
      if (!kind || !refTarget) return
      event.preventDefault()
      openRef({ editor, attrs: { kind, target: refTarget }, event })
    }

    root.addEventListener("click", onClick)
    return () => root.removeEventListener("click", onClick)
  }, [editor, openRef])
}
