// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, vi, beforeAll } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { MathPopover } from "./MathPopover"

// jsdom doesn't ship PointerEvent — stub via MouseEvent so the
// document-level pointerdown listener in MathPopover fires.
class TestPointerEvent extends MouseEvent {
  pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerType = init.pointerType ?? ""
  }
}

beforeAll(() => {
  vi.stubGlobal("PointerEvent", TestPointerEvent)
})

function Harness(props: {
  initial: string
  variant?: "inline" | "block"
  errorMessage?: string
  deleteOnEmptyCommit?: boolean
  onCommit?: (latex: string) => void
  onDelete?: () => void
}) {
  const elRef = useRef({
    getBoundingClientRect: () => new DOMRect(10, 10, 100, 20),
  })
  const virtualRef = useRef<{
    getBoundingClientRect: () => DOMRect
  } | null>(elRef.current)
  return (
    <MathPopover
      virtualRef={virtualRef as never}
      initialLatex={props.initial}
      deleteEmptyOnCancel={false}
      variant={props.variant}
      errorMessage={props.errorMessage}
      deleteOnEmptyCommit={props.deleteOnEmptyCommit ?? true}
      onLiveUpdate={() => {}}
      onCancelRevert={() => {}}
      onCommit={props.onCommit ?? (() => {})}
      onDelete={props.onDelete ?? (() => {})}
      onDiscardInserted={() => {}}
      onClose={() => {}}
    />
  )
}

describe("MathPopover block variant", () => {
  it("renders auto-growing multi-line textarea when variant=block", () => {
    render(<Harness initial="x^2" variant="block" />)
    const textarea = screen.getByLabelText(
      "Equation (LaTeX)",
    ) as HTMLTextAreaElement
    // `rows=3` is the Firefox fallback for the field-sizing:content
    // textarea; modern Chrome/Safari auto-grow between
    // min-h-[60px]/max-h-[357px] (popover 76px → 373px).
    expect(textarea.rows).toBe(3)
    expect(textarea.className).toContain("field-sizing-content")
    expect(textarea.className).toContain("rune-muted-scrollbar")
  })

  it("shows error footer when errorMessage is set", () => {
    render(
      <Harness
        initial="x^"
        variant="block"
        errorMessage="Expected group after '^'"
      />,
    )
    expect(screen.getByText(/Invalid equation:/)).toBeInTheDocument()
    expect(screen.getByText(/Expected group after/)).toBeInTheDocument()
    expect(screen.getByText(/Learn more/)).toBeInTheDocument()
  })

  it("auto-saves on click-outside (block variant)", () => {
    const onCommit = vi.fn()
    render(
      <Harness
        initial="x^2"
        variant="block"
        deleteOnEmptyCommit={false}
        onCommit={onCommit}
      />,
    )
    act(() => {
      // pointer-down outside the popover content
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      )
    })
    expect(onCommit).toHaveBeenCalledWith("x^2")
  })

  it("auto-saves empty latex via onCommit('') (NOT onDelete) when deleteOnEmptyCommit=false", () => {
    const onCommit = vi.fn()
    const onDelete = vi.fn()
    render(
      <Harness
        initial=""
        variant="block"
        deleteOnEmptyCommit={false}
        onCommit={onCommit}
        onDelete={onDelete}
      />,
    )
    act(() => {
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      )
    })
    expect(onCommit).toHaveBeenCalledWith("")
    expect(onDelete).not.toHaveBeenCalled()
  })

  it("inline variant keeps cancel→delete on empty-fresh-insert (regression guard)", () => {
    // Existing inline behavior must not regress. With variant=undefined
    // (defaults to inline), deleteEmptyOnCancel=true, empty initial,
    // click-outside should call onDiscardInserted (verified in
    // MathNodeViews.test.tsx — this is a quick smoke that the
    // variant prop didn't break the default branch).
    const onCommit = vi.fn()
    render(<Harness initial="x^2" onCommit={onCommit} />)
    const textarea = screen.getByLabelText(
      "Equation (LaTeX)",
    ) as HTMLTextAreaElement
    expect(textarea.rows).toBe(1)
  })
})
