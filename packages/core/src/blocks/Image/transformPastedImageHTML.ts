// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { EditorView } from "@tiptap/pm/view"
import type { RuneImportImageUrl, RuneImportMediaUrl } from "../media/import-plugin"

function hasImageUrlImporter(editor: Editor): boolean {
  const storage = editor.storage.imageImport as
    | {
        importMediaUrl?: RuneImportMediaUrl
        importImageUrl?: RuneImportImageUrl
      }
    | undefined
  return (
    typeof storage?.importMediaUrl === "function" ||
    typeof storage?.importImageUrl === "function"
  )
}

export function transformPastedImageHTML(
  doc: Document,
  view: EditorView,
  editor: Editor,
): void {
  if (!view.editable || !hasImageUrlImporter(editor)) return

  for (const img of Array.from(doc.body.querySelectorAll<HTMLImageElement>("img[src]"))) {
    const src = img.getAttribute("src")
    if (!src) continue
    img.setAttribute("data-rune-paste-image", src)
    img.removeAttribute("src")
  }
}
