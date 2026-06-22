// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Editor, Mark, type AnyExtension } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { describe, expect, it } from "vitest"
import { Paragraph } from "../../blocks/Paragraph/block"
import { createRuneKit } from "../../kit"
import { BlockSelection } from "../block-selection"
import { MultiBlockSelection } from "../block-selection/MultiBlockSelection"
import { GestureStatePlugin, gestureKey } from "../shared"
import { EntityRefs } from "."
import { createRefDecorationPlugin } from "./createRefDecorationPlugin"

interface ProbeRefAttrs {
  target: string
}

function makeEditor(extensions: AnyExtension[], content = "<p></p>") {
  const element = document.createElement("div")
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [Document, Paragraph, Text, ...extensions],
    content,
  })
  const destroy = editor.destroy.bind(editor)
  editor.destroy = () => {
    destroy()
    element.remove()
  }
  return editor
}

function makeProbeMark({
  name,
  refType = name,
  counter,
  attrs = () => null,
}: {
  name: string
  refType?: string
  counter?: { count: number }
  attrs?: (attrs: ProbeRefAttrs) => Record<string, string> | null
}) {
  return Mark.create({
    name,

    addAttributes() {
      return {
        target: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-target") ?? "",
          renderHTML: (attributes) =>
            attributes.target ? { "data-target": attributes.target } : {},
        },
      }
    },

    parseHTML() {
      return [{ tag: `span[data-probe-ref="${name}"]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return ["span", { ...HTMLAttributes, "data-probe-ref": name }, 0]
    },

    addProseMirrorPlugins() {
      return [
        createRefDecorationPlugin<ProbeRefAttrs>({
          refType,
          markName: this.name,
          deriveAttrs: (markAttrs) => {
            if (counter) counter.count += 1
            return attrs(markAttrs)
          },
        }),
      ]
    },
  })
}

describe("EntityRefs extension", () => {
  it("registers and exposes refreshEntityRefs command", () => {
    const editor = makeEditor([EntityRefs])
    try {
      expect(typeof editor.commands.refreshEntityRefs).toBe("function")
      expect(editor.commands.refreshEntityRefs()).toBe(true)
      expect(editor.commands.refreshEntityRefs("wikiLink")).toBe(true)
    } finally {
      editor.destroy()
    }
  })

  it("createRuneKit registers EntityRefs", () => {
    const element = document.createElement("div")
    document.body.appendChild(element)
    const editor = new Editor({
      element,
      extensions: createRuneKit({ suggestionMenus: false }),
      content: "<p></p>",
    })
    try {
      expect(typeof editor.commands.refreshEntityRefs).toBe("function")
      expect(editor.commands.refreshEntityRefs()).toBe(true)
    } finally {
      editor.destroy()
      element.remove()
    }
  })
})

describe("createRefDecorationPlugin", () => {
  it("refreshEntityRefs() re-invokes deriveAttrs once per mark instance", () => {
    const counter = { count: 0 }
    const ProbeMark = makeProbeMark({ name: "probeWikiLink", counter })
    const editor = makeEditor(
      [EntityRefs, ProbeMark],
      '<p><span data-probe-ref="probeWikiLink" data-target="a">A</span> <span data-probe-ref="probeWikiLink" data-target="b">B</span></p>',
    )
    try {
      const afterInit = counter.count
      expect(afterInit).toBe(2)

      expect(editor.commands.refreshEntityRefs()).toBe(true)
      expect(counter.count - afterInit).toBe(2)
    } finally {
      editor.destroy()
    }
  })

  it("scoped refresh only re-invokes the matching ref type", () => {
    const wikiCounter = { count: 0 }
    const fileCounter = { count: 0 }
    const WikiProbe = makeProbeMark({
      name: "probeWikiLink",
      refType: "wikiLink",
      counter: wikiCounter,
    })
    const FileProbe = makeProbeMark({
      name: "probeFileRef",
      refType: "fileRef",
      counter: fileCounter,
    })
    const editor = makeEditor(
      [EntityRefs, WikiProbe, FileProbe],
      '<p><span data-probe-ref="probeWikiLink" data-target="a">A</span> <span data-probe-ref="probeFileRef" data-target="f">F</span></p>',
    )
    try {
      const wikiAfterInit = wikiCounter.count
      const fileAfterInit = fileCounter.count

      expect(editor.commands.refreshEntityRefs("wikiLink")).toBe(true)
      expect(wikiCounter.count - wikiAfterInit).toBe(1)
      expect(fileCounter.count - fileAfterInit).toBe(0)
    } finally {
      editor.destroy()
    }
  })

  it("maps existing decorations on unrelated transactions", () => {
    const ProbeMark = makeProbeMark({
      name: "probeWikiLink",
      refType: "wikiLink",
      attrs: ({ target }) => ({ "data-probe-ref": target }),
    })
    const editor = makeEditor(
      [EntityRefs, ProbeMark],
      '<p><span data-probe-ref="probeWikiLink" data-target="a">A</span></p>',
    )
    try {
      let anchor = editor.view.dom.querySelector("[data-probe-ref='a']")
      expect(anchor?.getAttribute("data-probe-ref")).toBe("a")

      editor.commands.setTextSelection(1)
      editor.commands.insertContent("x")

      anchor = editor.view.dom.querySelector("[data-probe-ref='a']")
      expect(anchor?.getAttribute("data-probe-ref")).toBe("a")
    } finally {
      editor.destroy()
    }
  })

  it("refresh preserves MultiBlockSelection and gesture state", () => {
    const ProbeMark = makeProbeMark({ name: "probeWikiLink", refType: "wikiLink" })
    const editor = makeEditor(
      [EntityRefs, GestureStatePlugin, BlockSelection, ProbeMark],
      "<p>One</p><p>Two</p>",
    )
    try {
      expect(editor.commands.setBlockSelection({ from: 0, to: 1 })).toBe(true)
      editor.view.dispatch(
        editor.state.tr.setMeta(gestureKey, { activeGesture: "block-drag" }),
      )
      const beforeSelection = editor.state.selection
      const beforeGesture = gestureKey.getState(editor.state)

      expect(editor.commands.refreshEntityRefs()).toBe(true)

      expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
      expect(editor.state.selection.eq(beforeSelection)).toBe(true)
      expect(gestureKey.getState(editor.state)).toEqual(beforeGesture)
    } finally {
      editor.destroy()
    }
  })
})
