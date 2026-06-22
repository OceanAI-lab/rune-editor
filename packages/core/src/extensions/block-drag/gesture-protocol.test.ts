// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Task 2 — block-drag gesture protocol migration probes.
 *
 * AV-2: setEditable(false) mid-gesture must prevent doc mutation.
 *   - Start a drag (grip mousedown + mousemove past 5px threshold).
 *   - While `active` is live, call editor.setEditable(false).
 *   - Dispatch mouseup over a valid drop position → doc must be UNCHANGED,
 *     the registry must be released, and the drag chrome must be cleaned up.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { createBlockSpec } from "../../schema"
import { BlockDrag } from "./BlockDrag"
import { SideMenu, sideMenuKey } from "../side-menu/SideMenu"
import { GestureStatePlugin, gestureKey } from "../shared/gesture-state"
import { createTestEditor } from "../../test-utils/createTestEditor"

const Para = createBlockSpec({
  type: "paragraph",
  content: "inline*",
  parseDOM: [{ tag: "p" }],
  renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
  sideMenu: { draggable: true },
})

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  container.className = "rune-editor"
  document.body.appendChild(container)
  if (typeof document.elementFromPoint !== "function") {
    ;(document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () => null
  }
})

afterEach(() => {
  container.remove()
})

describe("AV-2 — block-drag commit gated on canCommit (setEditable mid-gesture)", () => {
  it("setEditable(false) while drag is active → mouseup does NOT reorder doc, registry released, chrome gone", async () => {
    const editor = createTestEditor({
      element: container,
      extensions: [Document, Text, Para, GestureStatePlugin, SideMenu, BlockDrag],
      content: "<p>A</p><p>B</p>",
    })

    // Hover block A so a grip appears.
    editor.view.dispatch(editor.state.tr.setMeta(sideMenuKey, { hoveredPos: 0 }))
    const grip = container.querySelector(".rune-side-menu-grip") as HTMLButtonElement | null
    expect(grip).not.toBeNull()

    // Stub getBoundingClientRect so geometry-dependent code has non-zero rects.
    const ps = container.querySelectorAll("p")
    ;(ps[0] as HTMLElement).getBoundingClientRect = () =>
      ({ top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    ;(ps[1] as HTMLElement).getBoundingClientRect = () =>
      ({ top: 40, bottom: 60, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect

    // Step 1: arm the drag into the ACTIVE stage (past 5px threshold).
    grip!.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 10, bubbles: true }))
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 50, bubbles: true, buttons: 1 }))
    // Verify the drag is truly active (preview exists, gesture is claimed).
    expect(document.querySelector(".rune-block-drag-preview")).not.toBeNull()
    expect(gestureKey.getState(editor.state)?.activeGesture).toBe("block-drag")

    // Step 2: switch to read-only WHILE the drag is live.
    editor.setEditable(false)

    // Step 3: release at a valid drop position (Y=50 → over block B → would
    // reorder A after B if commit were not gated).
    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 0, clientY: 50, bubbles: true }))

    await new Promise((r) => requestAnimationFrame(r))

    // Doc must be UNCHANGED (no reorder happened).
    expect(editor.state.doc.child(0).textContent).toBe("A")
    expect(editor.state.doc.child(1).textContent).toBe("B")

    // Registry must be released.
    expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()

    // Drag chrome must be cleaned up.
    expect(document.querySelector(".rune-block-drag-preview")).toBeNull()
    expect(document.querySelector(".rune-drag-indicator")).toBeNull()
  })
})
