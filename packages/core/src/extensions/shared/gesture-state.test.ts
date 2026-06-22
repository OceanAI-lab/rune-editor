// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import Document from "@tiptap/extension-document"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { GestureStatePlugin, gestureKey, claimGesture, isPrimaryRelease, primaryLost } from "./gesture-state"
import type { GestureName } from "./gesture-state"

function mkEditor() {
  // createTestEditor registers a guarded destroy for when an assertion throws
  // before the explicit destroy below — a leaked DOMObserver flush past jsdom
  // teardown fails the run with green tests.
  return createTestEditor({
    extensions: [Document, Paragraph, Text, GestureStatePlugin],
    content: "<p>hello</p>",
  })
}

describe("GestureStatePlugin", () => {
  it("starts with activeGesture null", () => {
    const editor = mkEditor()
    expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()
    editor.destroy()
  })

  it("persists meta set via tr.setMeta", () => {
    const editor = mkEditor()
    editor.view.dispatch(editor.state.tr.setMeta(gestureKey, { activeGesture: "block-drag" }))
    expect(gestureKey.getState(editor.state)?.activeGesture).toBe("block-drag")
    editor.view.dispatch(editor.state.tr.setMeta(gestureKey, { activeGesture: null }))
    expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()
    editor.destroy()
  })
})

describe("claimGesture", () => {
  it("claim on idle registry returns a handle and registry reads the gesture name", () => {
    const editor = mkEditor()
    const claim = claimGesture(editor.view, "drag-extend")
    expect(claim).not.toBeNull()
    expect(gestureKey.getState(editor.state)?.activeGesture).toBe("drag-extend")
    editor.destroy()
  })

  it("claim while another gesture owns the registry returns null and leaves registry untouched", () => {
    const editor = mkEditor()
    editor.view.dispatch(
      editor.state.tr.setMeta(gestureKey, { activeGesture: "marquee" }),
    )
    const claim = claimGesture(editor.view, "drag-extend")
    expect(claim).toBeNull()
    expect(gestureKey.getState(editor.state)?.activeGesture).toBe("marquee")
    editor.destroy()
  })

  it("release() clears the registry", () => {
    const editor = mkEditor()
    const claim = claimGesture(editor.view, "block-drag")!
    expect(claim).not.toBeNull()
    claim.release()
    expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()
    editor.destroy()
  })

  it("second release() is a no-op (idempotent)", () => {
    const editor = mkEditor()
    const claim = claimGesture(editor.view, "resize")!
    claim.release()
    // A second release should not throw and should leave registry null
    expect(() => claim.release()).not.toThrow()
    expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()
    editor.destroy()
  })

  it("release() does NOT clear the registry when another gesture has stolen ownership", () => {
    const editor = mkEditor()
    const claim = claimGesture(editor.view, "drag-extend")!
    // Simulate steal: thief directly overwrites the registry
    editor.view.dispatch(
      editor.state.tr.setMeta(gestureKey, { activeGesture: "marquee" as GestureName }),
    )
    // Our claim's release should not clear the thief's entry
    claim.release()
    expect(gestureKey.getState(editor.state)?.activeGesture).toBe("marquee")
    editor.destroy()
  })

  it("owned flips false after another gesture steals the registry", () => {
    const editor = mkEditor()
    const claim = claimGesture(editor.view, "drag-extend")!
    expect(claim.owned).toBe(true)
    // Simulate steal
    editor.view.dispatch(
      editor.state.tr.setMeta(gestureKey, { activeGesture: "marquee" as GestureName }),
    )
    expect(claim.owned).toBe(false)
    editor.destroy()
  })

  it("canCommit is false after editor.setEditable(false), true again after setEditable(true) while still owned", () => {
    const editor = mkEditor()
    const claim = claimGesture(editor.view, "block-drag")!
    expect(claim.owned).toBe(true)
    expect(claim.canCommit).toBe(true)

    editor.setEditable(false)
    expect(claim.canCommit).toBe(false)

    editor.setEditable(true)
    expect(claim.canCommit).toBe(true)

    editor.destroy()
  })

  it("claimGesture returns null when the view is destroyed", () => {
    const editor = mkEditor()
    // Capture the real PM EditorView before Tiptap replaces it with a proxy.
    // In production gesture code the `view` parameter always comes directly
    // from a PM plugin context (never via editor.view), so `view.isDestroyed`
    // is always the real PM getter.
    const view = editor.view
    editor.destroy()
    const claim = claimGesture(view, "resize")
    expect(claim).toBeNull()
  })

  it("release() does not throw when the view is destroyed", () => {
    const editor = mkEditor()
    const view = editor.view
    const claim = claimGesture(view, "drag-extend")!
    editor.destroy()
    expect(() => claim.release()).not.toThrow()
  })

  it("releaseInto() on an owned claim adds the meta; subsequent release() is a no-op (registry stays null, no throw)", () => {
    const editor = mkEditor()
    const claim = claimGesture(editor.view, "resize")!
    // releaseInto should stamp the meta on the tr
    const tr = claim.releaseInto(editor.state.tr)
    // Dispatch the tr to apply the meta
    editor.view.dispatch(tr)
    expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()
    // A second release() should be a no-op and not throw
    expect(() => claim.release()).not.toThrow()
    expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()
    editor.destroy()
  })

  it("releaseInto() after a steal returns the tr WITHOUT the meta (thief's entry survives when dispatched)", () => {
    const editor = mkEditor()
    const claim = claimGesture(editor.view, "drag-extend")!
    // Simulate steal: thief directly overwrites the registry
    editor.view.dispatch(
      editor.state.tr.setMeta(gestureKey, { activeGesture: "marquee" as GestureName }),
    )
    // releaseInto should not add the meta (not owned)
    const tr = claim.releaseInto(editor.state.tr)
    editor.view.dispatch(tr)
    // The thief's entry must survive
    expect(gestureKey.getState(editor.state)?.activeGesture).toBe("marquee")
    editor.destroy()
  })

  it("releaseInto() after release() is a no-op (returns tr unchanged)", () => {
    const editor = mkEditor()
    const claim = claimGesture(editor.view, "block-drag")!
    claim.release()
    expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()
    // Re-claim so registry is non-null; then releaseInto on the already-released claim should not touch it
    const claim2 = claimGesture(editor.view, "marquee")!
    const tr = claim.releaseInto(editor.state.tr)
    editor.view.dispatch(tr)
    // marquee's registry entry must survive
    expect(gestureKey.getState(editor.state)?.activeGesture).toBe("marquee")
    claim2.release()
    editor.destroy()
  })
})

describe("isPrimaryRelease", () => {
  it("returns true for button 0 (primary)", () => {
    const e = new MouseEvent("mouseup", { button: 0 })
    expect(isPrimaryRelease(e)).toBe(true)
  })

  it("returns false for button 1 (middle) or button 2 (right)", () => {
    expect(isPrimaryRelease(new MouseEvent("mouseup", { button: 1 }))).toBe(false)
    expect(isPrimaryRelease(new MouseEvent("mouseup", { button: 2 }))).toBe(false)
  })
})

describe("primaryLost", () => {
  it("returns true when primary button bit is not set in buttons", () => {
    // buttons=0 means no buttons held
    const e = new MouseEvent("mousemove", { buttons: 0 })
    expect(primaryLost(e)).toBe(true)
  })

  it("returns false when primary button is held (buttons & 1 === 1)", () => {
    const e = new MouseEvent("mousemove", { buttons: 1 })
    expect(primaryLost(e)).toBe(false)
  })

  it("returns false when primary + secondary buttons are held (buttons = 3)", () => {
    const e = new MouseEvent("mousemove", { buttons: 3 })
    expect(primaryLost(e)).toBe(false)
  })
})
