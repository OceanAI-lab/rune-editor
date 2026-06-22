// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { render, waitFor, act } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StrictMode, useState, type ReactNode } from "react"
import type { Editor } from "@tiptap/react"
import { RuneEditor } from "./RuneEditor"
import { RuneMarqueeZone } from "./RuneMarqueeZone"

// Contract guard for `<RuneMarqueeZone>`. These tests pin the
// observable lifecycle: with the host page handing the editor over
// asynchronously (queueMicrotask inside onReady — the v0.3.0-alpha.15
// bug-report mount pattern), the host wrapper — not `.rune-editor` —
// must own [data-rune-marquee-zone]. Confirmed empirically (via a
// scratch inline copy of the old `useRef` wrapper) that the regression
// itself does NOT reproduce under jsdom + React 19; it only manifests
// in the reporter's React Compiler + Electron build. These tests
// therefore serve as a contract pin (so an accidental future
// "simplification" of the wrapper that breaks this lifecycle would still
// trip the Playwright spec under a real browser) rather than a
// deterministic Compiler-regression catcher.
function Harness({
  strict,
  zoneClass,
}: {
  strict?: boolean
  zoneClass: string
}) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const body: ReactNode = (
    <RuneMarqueeZone editor={editor} className={zoneClass}>
      <RuneEditor
        content="<p>Hello</p>"
        onReady={(ed) => queueMicrotask(() => setEditor(ed))}
      />
    </RuneMarqueeZone>
  )
  return strict ? <StrictMode>{body}</StrictMode> : <>{body}</>
}

describe("RuneMarqueeZone", () => {
  it("registers the host wrapper as the marquee zone after async editor handoff", async () => {
    const { container } = render(<Harness zoneClass="host-zone-async" />)

    const host = container.querySelector(".host-zone-async") as HTMLElement
    const editorRoot = await waitFor(() => {
      const el = container.querySelector(".rune-editor")
      if (!(el instanceof HTMLElement)) throw new Error("editor not mounted yet")
      return el
    })

    await waitFor(() => {
      expect(host.hasAttribute("data-rune-marquee-zone")).toBe(true)
    })
    expect(editorRoot.hasAttribute("data-rune-marquee-zone")).toBe(false)
    // Single source of truth: only one element holds the attribute.
    expect(container.querySelectorAll("[data-rune-marquee-zone]")).toHaveLength(1)
  })

  it("registers the host wrapper under StrictMode (double-invoked effects)", async () => {
    // React 19 dev StrictMode double-invokes effects to surface stale
    // ref / cleanup bugs. The host wrapper must still own the zone after
    // the simulated unmount+remount cycle settles.
    const { container } = render(<Harness strict zoneClass="host-zone-strict" />)

    const host = container.querySelector(".host-zone-strict") as HTMLElement
    await waitFor(() => {
      expect(host.hasAttribute("data-rune-marquee-zone")).toBe(true)
    })
    const editorRoot = container.querySelector(".rune-editor") as HTMLElement
    expect(editorRoot.hasAttribute("data-rune-marquee-zone")).toBe(false)
  })

  it("reverts to default `.rune-editor` zone when the host wrapper unmounts", async () => {
    function ToggleHarness() {
      const [editor, setEditor] = useState<Editor | null>(null)
      const [zoneMounted, setZoneMounted] = useState(true)
      return (
        <>
          <button
            type="button"
            data-testid="toggle-zone"
            onClick={() => setZoneMounted((m) => !m)}
          />
          {zoneMounted ? (
            <RuneMarqueeZone editor={editor} className="toggleable-host">
              <RuneEditor
                content="<p>Hello</p>"
                onReady={(ed) => queueMicrotask(() => setEditor(ed))}
              />
            </RuneMarqueeZone>
          ) : (
            <RuneEditor
              content="<p>Hello</p>"
              onReady={(ed) => queueMicrotask(() => setEditor(ed))}
            />
          )}
        </>
      )
    }

    const { container, getByTestId } = render(<ToggleHarness />)
    const host = container.querySelector(".toggleable-host") as HTMLElement
    await waitFor(() => {
      expect(host.hasAttribute("data-rune-marquee-zone")).toBe(true)
    })

    await act(async () => {
      getByTestId("toggle-zone").click()
    })

    await waitFor(() => {
      const editorRoot = container.querySelector(".rune-editor") as HTMLElement
      expect(editorRoot.hasAttribute("data-rune-marquee-zone")).toBe(true)
    })
    expect(container.querySelector(".toggleable-host")).toBeNull()
  })
})
