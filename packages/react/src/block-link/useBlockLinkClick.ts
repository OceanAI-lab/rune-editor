// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useEffect } from "react"
import type { Editor } from "@tiptap/core"
import type { OpenRuneBlockLink, ParseRuneBlockLink } from "./types"

export interface UseBlockLinkClickOptions {
  editor: Editor | null
  parseBlockLink?: ParseRuneBlockLink
  openBlockLink?: OpenRuneBlockLink
}

export function useBlockLinkClick({
  editor,
  parseBlockLink,
  openBlockLink,
}: UseBlockLinkClickOptions): void {
  useEffect(() => {
    if (!editor || !parseBlockLink || !openBlockLink) return
    const root = editor.view.dom
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const anchor = target?.closest("a")
      if (!anchor || !root.contains(anchor)) return
      const href = anchor.getAttribute("href") ?? ""
      const parsed = parseBlockLink(href)
      if (!parsed) return
      event.preventDefault()
      openBlockLink({ editor, target: parsed, event })
    }

    root.addEventListener("click", onClick)
    return () => root.removeEventListener("click", onClick)
  }, [editor, parseBlockLink, openBlockLink])
}
