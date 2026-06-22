// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import { PLUS_SVG, GRIP_SVG } from "./svg"
import { addBlockBelowAndOpenSlash } from "./add-block"

export type SideMenuBlockPos = number | (() => number | undefined)

/**
 * Inline widget — lives INSIDE the hovered block's DOM. Positioning
 * is CSS-only (`position: absolute; left: -58px`).
 *
 * For textblocks: mounted via Decoration.widget at hoveredPos+1 (lands
 * inside the block's contentDOM).
 * For atoms (content: ""): mounted by the factory-injected NodeView's
 * .rune-side-menu-host slot. See createSpec.ts.
 *
 * No `contentEditable="false"` on the wrapper. PM's
 * addTextblockHacks would otherwise inject an
 * <img.ProseMirror-separator> (Safari caret-repaint workaround)
 * that Tailwind's preflight sizes as inline-block, shifting the
 * caret. Memory: project_pm_widget_textblock_hack.md. The textblock
 * decoration spec sets `raw: true` to opt out of PM's default
 * widget fixup; see SideMenu.ts.
 */
export function buildWidget(blockPos: SideMenuBlockPos, editor: Editor): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "rune-side-menu"
  wrap.style.opacity = "0"
  requestAnimationFrame(() => {
    wrap.style.opacity = "1"
  })

  const add = document.createElement("button")
  add.type = "button"
  add.className = "rune-side-menu-btn"
  add.setAttribute("aria-label", "Add block")
  add.setAttribute("data-rune-side-menu-button", "add")
  add.innerHTML = PLUS_SVG
  add.addEventListener("mousedown", (e) => e.preventDefault())
  add.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = typeof blockPos === "function" ? blockPos() : blockPos
    if (pos === undefined) return
    addBlockBelowAndOpenSlash(editor, pos)
  })
  wrap.appendChild(add)

  const grip = document.createElement("button")
  grip.type = "button"
  grip.className = "rune-side-menu-btn rune-side-menu-grip"
  grip.setAttribute("aria-label", "Drag block")
  grip.setAttribute("data-rune-side-menu-button", "grip")
  grip.innerHTML = GRIP_SVG
  // The grip's mousedown is owned by block-drag/gesture.ts, which
  // listens via a raw view.dom listener (so PM's `defaultPrevented`
  // gate on handleDOMEvents doesn't apply) and calls preventDefault
  // there to suppress the button's focus-steal / caret move. Do not
  // attach a handleDOMEvents.mousedown handler for the grip — it
  // would race with that listener.
  wrap.appendChild(grip)

  return wrap
}
