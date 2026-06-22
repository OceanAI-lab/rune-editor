// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * gesture-protocol.test.ts
 *
 * Probes for the GS3 gesture-protocol migration of the resize gesture.
 *
 * GS-4 probe: registry steal — another gesture claiming gestureKey mid-resize
 *   must not have its entry wiped by resize cleanup, and resize's own resizeKey
 *   preview must still be cleared.
 *
 * AV-2 probe (TDD): editor.setEditable(false) mid-drag must abort (restore
 *   previousFrameWidth, not commit contentWidth); registry must be released.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { getDocument } from "../../api"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { gestureKey } from "../shared/gesture-state"
import { resizeKey } from "./state"

// ---------------------------------------------------------------------------
// Shared helpers (mirrors BlockResize.test.ts)
// ---------------------------------------------------------------------------

function rect(width: number): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    right: width,
    bottom: 100,
    left: 0,
    width,
    height: 100,
    toJSON: () => ({}),
  } as DOMRect
}

function stubBlockSizing(
  block: HTMLElement,
  frame: HTMLElement,
  blockWidth = 500,
  frameWidth = 500,
) {
  Object.defineProperty(block, "clientWidth", {
    configurable: true,
    value: blockWidth,
  })
  block.getBoundingClientRect = () => rect(blockWidth)
  frame.getBoundingClientRect = () => rect(frameWidth)
  vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
    if (el === block) {
      return {
        paddingInlineStart: "0px",
        paddingInlineEnd: "0px",
        paddingLeft: "0px",
        paddingRight: "0px",
      } as CSSStyleDeclaration
    }
    return {
      paddingInlineStart: "0px",
      paddingInlineEnd: "0px",
      paddingLeft: "0px",
      paddingRight: "0px",
    } as CSSStyleDeclaration
  })
}

function dispatchMouse(
  target: EventTarget,
  type: string,
  clientX: number,
  init?: MouseEventInit,
) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX,
      clientY: 20,
      ...init,
    }),
  )
}

function createResizeTestEditor(
  opts?: Parameters<typeof createTestEditor>[0],
) {
  const editor = createTestEditor(opts)
  document.body.appendChild(editor.view.dom)
  return editor
}

const IMAGE_CONTENT = {
  type: "doc",
  content: [
    {
      type: "image",
      attrs: {
        id: "probe-img",
        src: "https://example.com/a.png",
        alt: "A",
      },
    },
  ],
} as never

// ---------------------------------------------------------------------------
// GS-4 probe: registry steal during a live resize must not corrupt thief's state
// ---------------------------------------------------------------------------

describe("GS-4: registry steal during resize", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it(
    "cleanup does NOT clear the registry when another gesture owns it, " +
      "but still clears resizeKey preview (GS-4 already resolved on P1 branch)",
    () => {
      const editor = createResizeTestEditor({ content: IMAGE_CONTENT })
      const block = editor.view.dom.querySelector<HTMLElement>(
        '.rune-block[data-id="probe-img"]',
      )!
      const frame = block.querySelector<HTMLElement>(":scope > .rune-block-content")!
      const handle = block.querySelector<HTMLElement>(".rune-resize-handle--end")!
      stubBlockSizing(block, frame, 500, 500)

      // Start a resize
      dispatchMouse(handle, "mousedown", 500)
      expect(gestureKey.getState(editor.state)?.activeGesture).toBe("resize")
      dispatchMouse(document, "mousemove", 400)
      expect(frame.style.width).toBe("80%")

      // Simulate another gesture stealing the registry mid-resize by dispatching
      // setMeta(gestureKey, { activeGesture: "marquee" }) directly.
      editor.view.dispatch(
        editor.view.state.tr.setMeta(gestureKey, { activeGesture: "marquee" }),
      )
      expect(gestureKey.getState(editor.state)?.activeGesture).toBe("marquee")

      // Now trigger resize cleanup (Escape cancels resize, calls cleanup(false))
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      )

      // The thief's registry entry ("marquee") must NOT have been wiped.
      expect(gestureKey.getState(editor.state)?.activeGesture).toBe("marquee")

      // Resize's own resizeKey preview state must be cleared.
      const rs = resizeKey.getState(editor.state)!
      expect(rs.activeBlockId).toBeNull()
      expect(rs.dragWidth).toBeNull()

      // Frame preview width must be restored to baseline (empty string = block owns none).
      expect(frame.style.width).toBe("")

      // No contentWidth committed
      expect(getDocument(editor)[0]).not.toHaveProperty("contentWidth")
    },
  )
})

// ---------------------------------------------------------------------------
// AV-2 probe: setEditable(false) mid-drag must abort, not commit
// ---------------------------------------------------------------------------

describe("AV-2: mid-gesture setEditable(false) must abort (TDD probe)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it(
    "setEditable(false) between mousemove and mouseup restores previousFrameWidth " +
      "and does NOT commit contentWidth; registry released",
    () => {
      const editor = createResizeTestEditor({ content: IMAGE_CONTENT })
      const block = editor.view.dom.querySelector<HTMLElement>(
        '.rune-block[data-id="probe-img"]',
      )!
      const frame = block.querySelector<HTMLElement>(":scope > .rune-block-content")!
      const handle = block.querySelector<HTMLElement>(".rune-resize-handle--end")!
      stubBlockSizing(block, frame, 500, 500)

      // Record the pre-drag frame width so we can assert it's restored.
      const initialFrameWidth = frame.style.width // "" before any resize

      // 1. Mousedown — claim gesture, arm listeners
      dispatchMouse(handle, "mousedown", 500)
      expect(gestureKey.getState(editor.state)?.activeGesture).toBe("resize")

      // 2. Mousemove with buttons:1 — preview width updates
      dispatchMouse(document, "mousemove", 300, { buttons: 1 })
      // 500px start, moved to 300 → delta = -200 on "end" handle → nextPx = 300, nextPct = 60%
      expect(frame.style.width).toBe("60%")

      // 3. editor.setEditable(false) — marks view as non-editable
      editor.setEditable(false)
      expect(editor.isEditable).toBe(false)

      // 4. Mouseup (primary release) — the gesture MUST NOT commit contentWidth
      dispatchMouse(document, "mouseup", 300, { button: 0, buttons: 0 })

      // Frame width must be restored to what it was before the drag started.
      expect(frame.style.width).toBe(initialFrameWidth)

      // contentWidth must not be set on the block.
      expect(getDocument(editor)[0]).not.toHaveProperty("contentWidth")

      // Registry must be released.
      expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()
    },
  )
})
