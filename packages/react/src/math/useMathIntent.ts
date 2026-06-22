// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useEffect, useRef } from "react"
import type { Editor } from "@tiptap/core"
import { mathControllerKey } from "@ocai/rune-core"

export function useMathIntent(
  editor: Editor,
  getPos: () => number | undefined,
  onOpen: (deleteEmptyOnCancel: boolean) => void,
) {
  // Tiptap's `getPos` is a fresh function reference per NodeView render,
  // so including it in the effect deps would re-run the effect every
  // render. The intent is set in the same transaction that creates the
  // node, so reading it once on mount is enough. Stash both args in refs
  // and depend only on `editor`.
  const getPosRef = useRef(getPos)
  getPosRef.current = getPos
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    if (!editor.isEditable) return
    const pos = getPosRef.current()
    const intent = mathControllerKey.getState(editor.state)?.openTarget
    if (typeof pos !== "number" || intent !== pos) return

    onOpenRef.current(true)
    editor.view.dispatch(
      editor.state.tr.setMeta(mathControllerKey, { type: "consume" }),
    )
  }, [editor])
}
