// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, afterEach } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { createBlockSpec } from "../../schema"
import { buildWidget } from "./widget"

const Para = createBlockSpec({
  type: "paragraph",
  content: "inline*",
  parseDOM: [{ tag: "p" }],
  renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
  sideMenu: { draggable: true },
})

function mkEditor() {
  return new Editor({
    extensions: [Document, Text, Para],
    content: "<p>hello</p>",
  })
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("buildWidget", () => {
  it("renders + and grip buttons", () => {
    const editor = mkEditor()
    const wrap = buildWidget(0, editor)
    expect(wrap.className).toBe("rune-side-menu")
    const buttons = wrap.querySelectorAll("button")
    expect(buttons.length).toBe(2)
    expect(buttons[0]?.getAttribute("data-rune-side-menu-button")).toBe("add")
    expect(buttons[1]?.getAttribute("data-rune-side-menu-button")).toBe("grip")
    editor.destroy()
  })

  it("grip has rune-side-menu-grip class for BlockDrag selector", () => {
    const editor = mkEditor()
    const wrap = buildWidget(0, editor)
    expect(wrap.querySelector(".rune-side-menu-grip")).not.toBeNull()
    editor.destroy()
  })

  it("buttons preventDefault on mousedown", () => {
    const editor = mkEditor()
    const wrap = buildWidget(0, editor)
    document.body.appendChild(wrap)
    const addBtn = wrap.querySelector(
      '[data-rune-side-menu-button="add"]',
    ) as HTMLButtonElement
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    addBtn.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    editor.destroy()
  })

  it("opacity fades in on next frame", async () => {
    const editor = mkEditor()
    const wrap = buildWidget(0, editor)
    expect(wrap.style.opacity).toBe("0")
    await new Promise((r) => requestAnimationFrame(r))
    expect(wrap.style.opacity).toBe("1")
    editor.destroy()
  })
})

import { SuggestionMenus } from "../suggestion-menus/SuggestionMenus"

type SMStorage = {
  suggestionMenus: {
    triggers: Record<string, { getSnapshot: () => { show: boolean } }>
  }
}

describe("buildWidget — + click opens slash menu", () => {
  it("click on + adds a paragraph below and opens '/' menu", async () => {
    const editor = new Editor({
      extensions: [
        Document,
        Text,
        Para,
        SuggestionMenus.configure({ triggers: [{ char: "/" }] }),
      ],
      content: "<p>hello</p>",
    })
    const wrap = buildWidget(0, editor)
    document.body.appendChild(wrap)
    const add = wrap.querySelector(
      '[data-rune-side-menu-button="add"]',
    ) as HTMLButtonElement
    add.click()

    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.child(1).textContent).toBe("/")

    await Promise.resolve()
    const store = (editor.storage as unknown as SMStorage).suggestionMenus.triggers["/"]!
    expect(store.getSnapshot().show).toBe(true)

    editor.destroy()
  })
})
