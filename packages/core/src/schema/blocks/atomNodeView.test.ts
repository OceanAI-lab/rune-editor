// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, onTestFinished } from "vitest"
import { DOMSerializer } from "@tiptap/pm/model"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import type { Extensions } from "@tiptap/core"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { createBlockSpec } from "./createSpec"
import type { RuneInPlaceAttr } from "./createSpec"
import { Image } from "../../blocks/Image/block"
import { Video } from "../../blocks/Video/block"

function mountEditor(extensions: Extensions, content: unknown) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  onTestFinished(() => container.remove())
  const editor = createTestEditor({
    element: container,
    extensions,
    content: content as string,
  })
  return { container, editor }
}

/** Minimal factory atom block; tests vary only type / props / inPlaceAttrs. */
function mkAtomSpec(opts: {
  type: string
  props?: Record<string, { default: unknown; renderHTML: () => Record<string, never> }>
  inPlaceAttrs?: ReadonlyArray<RuneInPlaceAttr>
}) {
  return createBlockSpec({
    type: opts.type,
    content: "",
    props: opts.props ?? { tint: { default: "none", renderHTML: () => ({}) } },
    ...(opts.inPlaceAttrs ? { inPlaceAttrs: opts.inPlaceAttrs } : {}),
    parseDOM: [{ tag: opts.type }],
    renderDOM: ({ HTMLAttributes }) => [
      "div",
      { ...HTMLAttributes, class: "rune-block" },
      ["hr"],
    ],
    sideMenu: { draggable: true },
  })
}

describe("createAtomNodeView — spec-declared in-place attrs", () => {
  it("absorbs a declared attr change via the spec's applyToDOM (no rebuild)", () => {
    const AtomTinted = mkAtomSpec({
      type: "test-atom-tint",
      props: {
        tint: { default: "none", renderHTML: () => ({}) },
        other: { default: "a", renderHTML: () => ({}) },
      },
      inPlaceAttrs: [
        {
          attr: "tint",
          applyToDOM: ({ root }, value) => {
            root.setAttribute("data-tint", String(value))
          },
        },
      ],
    })

    const { container, editor } = mountEditor(
      [Document, Text, AtomTinted],
      "<test-atom-tint></test-atom-tint>",
    )

    const before = container.querySelector(".rune-block") as HTMLElement
    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "tint", "blue"))
    expect(container.querySelector(".rune-block")).toBe(before)
    expect(before.getAttribute("data-tint")).toBe("blue")
  })

  it("rebuilds on a changed attr without a declared pair", () => {
    const AtomTinted = mkAtomSpec({
      type: "test-atom-tint-rebuild",
      props: {
        tint: { default: "none", renderHTML: () => ({}) },
        other: { default: "a", renderHTML: () => ({}) },
      },
      inPlaceAttrs: [
        {
          attr: "tint",
          applyToDOM: ({ root }, value) => {
            root.setAttribute("data-tint", String(value))
          },
        },
      ],
    })

    const { container, editor } = mountEditor(
      [Document, Text, AtomTinted],
      "<test-atom-tint-rebuild></test-atom-tint-rebuild>",
    )

    const before = container.querySelector(".rune-block") as HTMLElement
    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "other", "b"))
    const after = container.querySelector(".rune-block") as HTMLElement
    expect(after).not.toBe(before)
  })

  it("rebuilds when a declared pair's applyToDOM declines (returns false)", () => {
    // Mirrors the contentWidth contract: the pair targets the
    // `.rune-block-content` element, and mkAtomSpec renders no such child —
    // the pair cannot apply in place and must decline into a rebuild.
    const AtomNoContent = mkAtomSpec({
      type: "test-atom-decline",
      inPlaceAttrs: [
        {
          attr: "tint",
          applyToDOM: ({ content }, value) => {
            if (!content) return false
            content.setAttribute("data-tint", String(value))
          },
        },
      ],
    })

    const { container, editor } = mountEditor(
      [Document, Text, AtomNoContent],
      "<test-atom-decline></test-atom-decline>",
    )

    const before = container.querySelector(".rune-block") as HTMLElement
    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "tint", "blue"))
    const after = container.querySelector(".rune-block") as HTMLElement
    expect(after).not.toBe(before)
    expect(after.hasAttribute("data-tint")).toBe(false)
  })

  it("absorbs a value-equal attrs rewrite even with no declared pairs", () => {
    // PM's AttrStep always builds a fresh attrs object, even when the new
    // value === the old one (e.g. re-clicking the pressed alignment
    // option). Absorption must not depend on declarations — a rebuild
    // would unmount chrome portaled inside the NodeView mid-interaction.
    const AtomPlain = mkAtomSpec({ type: "test-atom-plain" })

    const { container, editor } = mountEditor(
      [Document, Text, AtomPlain],
      "<test-atom-plain></test-atom-plain>",
    )

    const before = container.querySelector(".rune-block") as HTMLElement
    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "tint", "none"))
    expect(container.querySelector(".rune-block")).toBe(before)
  })

  it("image absorbs align and contentWidth changes in place", () => {
    const { container, editor } = mountEditor([Document, Text, Image], {
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://cdn.example/a.png" } },
      ],
    })

    const before = container.querySelector(".rune-block") as HTMLElement
    const content = before.querySelector<HTMLElement>(
      ":scope > .rune-block-content",
    )
    expect(content).not.toBeNull()

    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "align", "right"))
    expect(container.querySelector(".rune-block")).toBe(before)
    expect(before.getAttribute("data-align")).toBe("right")

    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "align", "center"))
    expect(container.querySelector(".rune-block")).toBe(before)
    expect(before.hasAttribute("data-align")).toBe(false)

    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "contentWidth", 50))
    expect(container.querySelector(".rune-block")).toBe(before)
    expect(content!.style.width).toBe("50%")
    expect(content!.hasAttribute("data-rune-resized")).toBe(true)

    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "contentWidth", null))
    expect(container.querySelector(".rune-block")).toBe(before)
    expect(content!.style.width).toBe("")
    expect(content!.hasAttribute("data-rune-resized")).toBe(false)
  })

  it("empty-state image absorbs contentWidth as a no-op (no placeholder styling, no rebuild)", () => {
    // renderDOM's empty branch never applies contentWidth, so the in-place
    // pair must not write it either — otherwise the live DOM diverges from
    // what a rebuild/reload renders. {src: "", contentWidth: N} is a legal
    // doc state (fromInput accepts contentWidth without gating on src).
    const { container, editor } = mountEditor([Document, Text, Image], {
      type: "doc",
      content: [{ type: "image", attrs: { src: "" } }],
    })

    const before = container.querySelector(".rune-block") as HTMLElement
    const content = before.querySelector<HTMLElement>(
      ":scope > .rune-block-content",
    )
    expect(content).not.toBeNull()

    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "contentWidth", 50))
    expect(container.querySelector(".rune-block")).toBe(before)
    expect(content!.style.width).toBe("")
    expect(content!.hasAttribute("data-rune-resized")).toBe(false)
  })

  it("video absorbs align in place; src change rebuilds", () => {
    const { container, editor } = mountEditor([Document, Text, Video], {
      type: "doc",
      content: [
        {
          type: "video",
          attrs: { sourceType: "asset", src: "https://cdn.example/clip.mp4" },
        },
      ],
    })

    const before = container.querySelector(".rune-block") as HTMLElement
    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "align", "left"))
    expect(container.querySelector(".rune-block")).toBe(before)
    expect(before.getAttribute("data-align")).toBe("left")

    editor.view.dispatch(
      editor.state.tr.setNodeAttribute(0, "src", "https://cdn.example/other.mp4"),
    )
    expect(container.querySelector(".rune-block")).not.toBe(before)
  })
})

describe("createAtomNodeView — in-place/render parity", () => {
  // The in-place appliers (align.ts / contentWidth.ts) are hand-written
  // mirrors of the render-path helpers. These tests pin the contract: after
  // an absorb, the live DOM's contract attrs (data-align, content width,
  // data-rune-resized) equal what a rebuild/reload renders for the same
  // node — if either side drifts, parity fails here instead of as a
  // "live DOM differs after reload" bug in production.
  function expectImageParity(container: HTMLElement, editor: ReturnType<typeof createTestEditor>) {
    const live = container.querySelector(".rune-block") as HTMLElement
    const liveContent = live.querySelector<HTMLElement>(
      ":scope > .rune-block-content",
    ) as HTMLElement
    const fresh = DOMSerializer.fromSchema(editor.schema).serializeNode(
      editor.state.doc.child(0),
    ) as HTMLElement
    const freshContent = fresh.querySelector<HTMLElement>(
      ":scope > .rune-block-content",
    ) as HTMLElement
    expect(live.getAttribute("data-align")).toBe(fresh.getAttribute("data-align"))
    expect(liveContent.style.width).toBe(freshContent.style.width)
    expect(liveContent.hasAttribute("data-rune-resized")).toBe(
      freshContent.hasAttribute("data-rune-resized"),
    )
  }

  it("filled image: every absorbed align/contentWidth state matches a fresh render", () => {
    const { container, editor } = mountEditor([Document, Text, Image], {
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://cdn.example/a.png" } },
      ],
    })
    const before = container.querySelector(".rune-block")

    const steps: ReadonlyArray<[string, unknown]> = [
      ["align", "right"],
      ["contentWidth", 50],
      ["align", "center"], // default → attr REMOVAL path
      ["contentWidth", null], // default → width/marker CLEAR path
    ]
    for (const [attr, value] of steps) {
      editor.view.dispatch(editor.state.tr.setNodeAttribute(0, attr, value))
      expect(container.querySelector(".rune-block")).toBe(before)
      expectImageParity(container, editor)
    }
  })

  it("empty-state image: absorbed contentWidth no-op matches a fresh render", () => {
    const { container, editor } = mountEditor([Document, Text, Image], {
      type: "doc",
      content: [{ type: "image", attrs: { src: "" } }],
    })
    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "contentWidth", 50))
    expectImageParity(container, editor)
  })
})
