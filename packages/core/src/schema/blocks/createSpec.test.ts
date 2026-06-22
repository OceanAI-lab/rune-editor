// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, vi } from "vitest"
import { Editor, Extension } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model"
import { createBlockSpec } from "./createSpec"
import { createBlockExtension } from "./createBlockExtension"
import { BlockId } from "../../extensions/block-id"
import { buildClipboardSerializer } from "../../extensions/clipboard/serializer"

describe("createBlockSpec — extensions slot: keyboardShortcuts", () => {
  it("compiles per-block keyboardShortcuts into an extension that reaches the manager", () => {
    const ShortcutHost = createBlockSpec({
      type: "shortcut-host",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
      extensions: [
        createBlockExtension({
          key: "test",
          keyboardShortcuts: {
            "Mod-Alt-9": () => true,
          },
        }),
      ],
    })

    const editor = new Editor({
      extensions: [Document, Text, ShortcutHost],
      content: "<p></p>",
    })

    // The compiled child extension should be registered with the namespaced
    // name `${type}--${key}`.
    const childExt = editor.extensionManager.extensions.find(
      (e) => e.name === "shortcut-host--test",
    )
    expect(childExt).toBeDefined()

    // Sanity: the keyboardShortcuts config on the compiled child should
    // contain the chord we declared.
    const shortcuts = (childExt as any).config.addKeyboardShortcuts.call({
      editor,
      type: childExt,
      options: {},
    })
    expect(Object.keys(shortcuts)).toContain("Mod-Alt-9")

    editor.destroy()
  })
})

describe("createBlockSpec — extensions slot: inputRules", () => {
  it("textblock target: typing trigger converts paragraph to heading, trigger text removed", async () => {
    const Para = createBlockSpec({
      type: "paragraph",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
      extensions: [
        createBlockExtension({
          key: "heading-rule",
          inputRules: [
            {
              find: /^#\s$/,
              replace: () => ({ type: "heading", props: { level: 2 } }),
            },
          ],
        }),
      ],
    })
    const Heading = createBlockSpec({
      type: "heading",
      content: "inline*",
      props: {
        level: { default: 2, parseHTML: () => 2, renderHTML: () => ({}) },
      },
      parseDOM: [{ tag: "h2" }],
      renderDOM: ({ HTMLAttributes }) => ["h2", HTMLAttributes, 0],
    })

    const editor = new Editor({
      extensions: [Document, Text, Para, Heading],
      content: "<p>#</p>",
    })

    // Place caret after the "#" — position 2 (1 = start of paragraph, +1 for "#").
    editor.commands.setTextSelection(2)
    await triggerInputRule(editor, 1, 2, " ")

    expect(editor.state.doc.firstChild?.type.name).toBe("heading")
    expect(editor.state.doc.textContent).toBe("")
    editor.destroy()
  })

  it("atom target: typing trigger replaces paragraph with atom + trailing paragraph + caret in tail", async () => {
    const Para = createBlockSpec({
      type: "paragraph",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
      extensions: [
        createBlockExtension({
          key: "divider-rule",
          inputRules: [
            { find: /^---\s$/, replace: () => ({ type: "test-divider" }) },
          ],
        }),
      ],
    })
    const Divider = createBlockSpec({
      type: "test-divider",
      content: "",
      parseDOM: [{ tag: "hr" }],
      renderDOM: ({ HTMLAttributes }) => [
        "div",
        { ...HTMLAttributes, class: "rune-block" },
        ["hr"],
      ],
    })

    const editor = new Editor({
      extensions: [Document, Text, Para, Divider],
      content: "<p>---</p>",
    })

    editor.commands.setTextSelection(4) // after "---"
    await triggerInputRule(editor, 1, 4, " ")

    expect(editor.state.doc.firstChild?.type.name).toBe("test-divider")
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph")
    expect(editor.state.doc.lastChild?.textContent).toBe("")
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph")
    editor.destroy()
  })
})

// Trigger an input rule by routing through PM's handleTextInput view prop.
// This is the synchronous path Tiptap registers input rules under (see
// @tiptap/core src/InputRule.ts). If the sync path doesn't fire (some PM
// gates check composing/IME state that jsdom doesn't simulate), fall back
// to the applyInputRules meta path.
//
// NOTE: Tiptap's run() resolves $from at `from` to get text-before-cursor.
// We pass `to` as the handleTextInput `from` so the text-before-cursor
// lookup includes all existing text (e.g. "#") in the block. The outer
// `from` is only used by callers to denote the start of the match range;
// `to` is the actual cursor position after the existing text.
describe("createBlockSpec — clipboardRenderDOM slot", () => {
  it("stores clipboardRenderDOM on the block's storage when declared", () => {
    const Foo = createBlockSpec({
      type: "fooblock",
      content: "inline*",
      parseDOM: [{ tag: "foo-block" }],
      renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, ["span", 0]],
      clipboardRenderDOM: ({ node }) => ["span", { "data-foo": node.attrs.id ?? "" }, 0],
    })
    const editor = new Editor({ extensions: [Document, Text, Foo] })
    const meta = editor.extensionManager.extensions.find((e) => e.name === "fooblock")?.storage
    expect(meta).toBeDefined()
    expect(typeof meta!.clipboardRenderDOM).toBe("function")
    editor.destroy()
  })

  it("leaves clipboardRenderDOM undefined on storage when not declared", () => {
    const Bar = createBlockSpec({
      type: "barblock",
      content: "inline*",
      parseDOM: [{ tag: "bar-block" }],
      renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, 0],
    })
    const editor = new Editor({ extensions: [Document, Text, Bar] })
    const meta = editor.extensionManager.extensions.find((e) => e.name === "barblock")?.storage
    expect(meta).toBeDefined()
    expect(meta!.clipboardRenderDOM).toBeUndefined()
    editor.destroy()
  })

  it("stores renderDOM on storage so the clipboard serializer can fall back to it", () => {
    const Bar = createBlockSpec({
      type: "barblock2",
      content: "inline*",
      parseDOM: [{ tag: "bar-block-2" }],
      renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, 0],
    })
    const editor = new Editor({ extensions: [Document, Text, Bar] })
    const meta = editor.extensionManager.extensions.find((e) => e.name === "barblock2")?.storage
    expect(typeof meta!.renderDOM).toBe("function")
    editor.destroy()
  })
})

describe("createBlockSpec — toRuneBlock hook", () => {
  it("exposes toRuneBlock on storage when declared", () => {
    type Probe = { type: "probe"; id: string; depth: number; data: string }
    const Probe = createBlockSpec({
      type: "probe",
      content: "inline*",
      parseDOM: [{ tag: "probe" }],
      renderDOM: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
      toRuneBlock: (node): Probe => ({
        type: "probe",
        id: (node.attrs.id as string) ?? "",
        depth: (node.attrs.depth as number) ?? 0,
        data: node.textContent,
      }),
    })

    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Text, Probe],
      content: { type: "doc", content: [{ type: "probe", content: [{ type: "text", text: "hi" }] }] },
    })

    const storage = editor.extensionManager.extensions
      .find((e) => e.name === "probe")?.storage as {
        toRuneBlock?: (node: ProseMirrorNode) => unknown
      }
    const node = editor.state.doc.firstChild!
    expect(storage?.toRuneBlock).toBeTypeOf("function")
    expect(storage?.toRuneBlock?.(node)).toEqual({
      type: "probe",
      id: "",
      depth: 0,
      data: "hi",
    })
    editor.destroy()
  })

  it("storage.toRuneBlock is undefined when not declared (preserves M8.1 storage shape)", () => {
    const Plain = createBlockSpec({
      type: "plain-noproj",
      content: "inline*",
      parseDOM: [{ tag: "plain-noproj" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
    })
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Text, Plain],
    })
    const storage = editor.extensionManager.extensions
      .find((e) => e.name === "plain-noproj")?.storage as { toRuneBlock?: unknown }
    expect(storage?.toRuneBlock).toBeUndefined()
    editor.destroy()
  })
})

describe("createBlockSpec — fromInput hook", () => {
  it("exposes fromInput on storage when declared, with schema/input/defaults plumbed", () => {
    const Probe = createBlockSpec({
      type: "probe2",
      content: "inline*",
      parseDOM: [{ tag: "probe2" }],
      renderDOM: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
      fromInput: ({ schema, input, defaults }) => {
        const t = schema.nodes["probe2"]
        if (!t) return null
        return t.create(
          { id: input.id ?? null, depth: input.depth ?? defaults.depth },
          input.text ? schema.text(input.text as string) : undefined,
        )
      },
    })
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Text, Probe],
    })
    const storage = editor.extensionManager.extensions
      .find((e) => e.name === "probe2")?.storage as {
      fromInput?: (args: {
        schema: typeof editor.schema
        input: { type: string; id?: string; depth?: number; text?: string }
        defaults: { depth: number }
      }) => ProseMirrorNode | null
    }
    expect(storage?.fromInput).toBeTypeOf("function")
    const node = storage.fromInput?.({
      schema: editor.schema,
      input: { type: "probe2", id: "probe-id", text: "from hook" },
      defaults: { depth: 3 },
    })
    expect(node?.type.name).toBe("probe2")
    expect(node?.attrs).toMatchObject({ id: "probe-id", depth: 3 })
    expect(node?.textContent).toBe("from hook")
    editor.destroy()
  })

  it("storage.fromInput is undefined when not declared", () => {
    const Plain = createBlockSpec({
      type: "plain-nofrom",
      content: "inline*",
      parseDOM: [{ tag: "plain-nofrom" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
    })
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Text, Plain],
    })
    const storage = editor.extensionManager.extensions
      .find((e) => e.name === "plain-nofrom")?.storage as { fromInput?: unknown }
    expect(storage?.fromInput).toBeUndefined()
    editor.destroy()
  })
})

describe("createBlockSpec — bleed", () => {
  it("injects data-bleed='full' into renderDOM HTMLAttributes when bleed='full'", () => {
    const spec = createBlockSpec({
      type: "bleed-test",
      content: "inline*",
      bleed: "full",
      parseDOM: [{ tag: "div.bleed-test" }],
      renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, 0],
    })

    const editor = new Editor({ extensions: [Document, Text, Paragraph, spec], content: "" })
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "bleed-test", content: [{ type: "text", text: "x" }] }],
    })

    expect(editor.getHTML()).toContain('data-bleed="full"')
    editor.destroy()
  })

  it("omits data-bleed when bleed is undefined or content", () => {
    const spec = createBlockSpec({
      type: "content-bleed-test",
      content: "inline*",
      bleed: "content",
      parseDOM: [{ tag: "div.content-bleed-test" }],
      renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, 0],
    })

    const editor = new Editor({ extensions: [Document, Text, Paragraph, spec], content: "" })
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "content-bleed-test", content: [{ type: "text", text: "x" }] }],
    })

    expect(editor.getHTML()).not.toContain("data-bleed")
    editor.destroy()
  })

  it("excludes data-bleed from serialized clipboard HTML", () => {
    const clipRender = vi.fn(
      ({ node }: { node: ProseMirrorNode }): DOMOutputSpec => [
        "div",
        {},
        node.textContent ?? "",
      ],
    )
    const spec = createBlockSpec({
      type: "bleedcliptest",
      content: "inline*",
      bleed: "full",
      parseDOM: [{ tag: "div.bleed-clip-test" }],
      renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, 0],
      clipboardRenderDOM: clipRender,
    })

    const editor = new Editor({ extensions: [Document, Text, Paragraph, spec], content: "" })
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "bleedcliptest", content: [{ type: "text", text: "x" }] }],
    })

    const node = editor.state.doc.firstChild!
    const serializer = buildClipboardSerializer(editor)
    const dom = serializer.serializeNode(node) as HTMLElement

    expect(dom.outerHTML).toBe("<div>x</div>")
    expect(dom.outerHTML).not.toContain("data-bleed")
    expect(clipRender).toHaveBeenCalledOnce()
    editor.destroy()
  })
})

describe("createBlockSpec — nodeView slot", () => {
  it("uses nodeView for the live editor while keeping renderDOM as the serialization fallback", () => {
    const received: {
      hasView?: boolean
      hasExtension?: boolean
      decorations?: boolean
      innerDecorations?: boolean
      stopEvent?: boolean
    } = {}

    const NodeViewBlock = createBlockSpec({
      type: "node-view-block",
      content: "inline*",
      props: {
        tone: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-tone") ?? "",
          renderHTML: (attrs): Record<string, string> =>
            attrs.tone ? { "data-tone": attrs.tone as string } : {},
        },
      },
      parseDOM: [{ tag: "node-view-block" }],
      renderDOM: ({ HTMLAttributes }) => ["div", { ...HTMLAttributes, "data-render-dom": "true" }, 0],
      nodeView: ({ HTMLAttributes, decorations, editor, extension, getPos, innerDecorations, view }) => {
        received.hasView = Boolean(view) && Boolean(editor)
        received.hasExtension = extension.name === "node-view-block"
        received.decorations = Array.isArray(decorations)
        received.innerDecorations = Boolean(innerDecorations)

        const dom = document.createElement("div")
        dom.dataset.nodeView = "true"
        for (const [name, value] of Object.entries(HTMLAttributes)) {
          dom.setAttribute(name, String(value))
        }
        dom.dataset.pos = String(getPos())

        const contentDOM = document.createElement("span")
        contentDOM.dataset.content = "true"
        dom.appendChild(contentDOM)
        received.stopEvent = true
        return {
          dom,
          contentDOM,
          stopEvent: () => {
            received.stopEvent = true
            return false
          },
        }
      },
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, NodeViewBlock],
      content: '<node-view-block data-tone="warm">hello</node-view-block>',
    })

    const liveBlock = container.querySelector("[data-node-view='true']") as HTMLElement
    expect(liveBlock).not.toBeNull()
    expect(liveBlock.getAttribute("data-tone")).toBe("warm")
    expect(liveBlock.querySelector("[data-content='true']")?.textContent).toBe("hello")
    expect(container.querySelector("[data-render-dom='true']")).toBeNull()
    expect(received).toMatchObject({
      hasView: true,
      hasExtension: true,
      decorations: true,
      innerDecorations: true,
      stopEvent: true,
    })

    expect(editor.getHTML()).toContain('data-render-dom="true"')
    expect(editor.getHTML()).not.toContain("data-node-view")

    editor.destroy()
    container.remove()
  })

  it("falls back to renderDOM when nodeView is omitted", () => {
    const PlainBlock = createBlockSpec({
      type: "plain-node-view-fallback",
      content: "inline*",
      parseDOM: [{ tag: "plain-node-view-fallback" }],
      renderDOM: ({ HTMLAttributes }) => ["section", HTMLAttributes, ["p", 0]],
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, PlainBlock],
      content: { type: "doc", content: [{ type: "plain-node-view-fallback" }] },
    })

    expect(container.querySelector("section")).not.toBeNull()
    editor.destroy()
    container.remove()
  })

  it("lets configure({ nodeView }) override the atom fallback NodeView", () => {
    const ConfigurableAtom = createBlockSpec({
      type: "configurable-atom-node-view",
      content: "",
      props: {
        tone: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-tone") ?? "",
          renderHTML: (attrs): Record<string, string> =>
            attrs.tone ? { "data-tone": attrs.tone as string } : {},
        },
      },
      parseDOM: [{ tag: "configurable-atom-node-view" }],
      renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes],
    })

    const RuntimeAtom = ConfigurableAtom.configure({
      nodeView: ({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) => {
        const dom = document.createElement("div")
        dom.dataset.runtimeNodeView = "true"
        for (const [name, value] of Object.entries(HTMLAttributes)) {
          dom.setAttribute(name, String(value))
        }
        return { dom }
      },
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, RuntimeAtom],
      content: '<configurable-atom-node-view data-tone="warm"></configurable-atom-node-view>',
    })

    const live = container.querySelector("[data-runtime-node-view='true']")
    expect(live).not.toBeNull()
    expect(live?.getAttribute("data-tone")).toBe("warm")

    editor.destroy()
    container.remove()
  })
})

describe("createBlockSpec — meta", () => {
  it("defaults defining to true when meta is omitted", () => {
    const Plain = createBlockSpec({
      type: "meta-default-block",
      content: "inline*",
      parseDOM: [{ tag: "meta-default-block" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
    })

    const editor = new Editor({
      extensions: [Document, Text, Plain],
    })

    expect(editor.schema.nodes["meta-default-block"]!.spec.defining).toBe(true)
    editor.destroy()
  })

  it("propagates meta.defining false to the NodeSpec", () => {
    const Atom = createBlockSpec({
      type: "meta-defining-block",
      content: "",
      meta: { defining: false },
      parseDOM: [{ tag: "meta-defining-block" }],
      renderDOM: () => ["div", { class: "rune-block" }, ["hr"]],
    })

    const editor = new Editor({
      extensions: [Document, Text, Atom],
    })

    expect(editor.schema.nodes["meta-defining-block"]!.spec.defining).toBe(false)
    editor.destroy()
  })

  it("propagates meta code, isolating, and selectable to the NodeSpec", () => {
    const CodeLike = createBlockSpec({
      type: "meta-code-block",
      content: "inline*",
      meta: {
        selectable: false,
        code: true,
        isolating: true,
      },
      parseDOM: [{ tag: "meta-code-block" }],
      renderDOM: ({ HTMLAttributes }) => ["pre", HTMLAttributes, 0],
    })

    const editor = new Editor({
      extensions: [Document, Text, CodeLike],
    })

    const spec = editor.schema.nodes["meta-code-block"]!.spec
    expect(spec.selectable).toBe(false)
    expect(spec.code).toBe(true)
    expect(spec.isolating).toBe(true)
    editor.destroy()
  })

  it("exposes meta.hardBreakShortcut via storage", () => {
    const QuoteLike = createBlockSpec({
      type: "meta-storage-block",
      content: "inline*",
      meta: { hardBreakShortcut: "enter" },
      parseDOM: [{ tag: "meta-storage-block" }],
      renderDOM: ({ HTMLAttributes }) => ["blockquote", HTMLAttributes, 0],
    })

    const editor = new Editor({
      extensions: [Document, Text, QuoteLike],
    })

    const metaStorage = editor.extensionManager.extensions.find((e) => e.name === "meta-storage-block")?.storage
    expect(metaStorage?.hardBreakShortcut).toBe("enter")
    editor.destroy()
  })
})

async function triggerInputRule(editor: Editor, from: number, to: number, text: string) {
  // Pass `to` as the cursor position — text-before-cursor = text[0..to].
  const handled = editor.view.someProp("handleTextInput", (fn) =>
    fn(editor.view, to, to, text, null as any),
  )
  if (handled) return
  // Async fallback. PM's input-rule plugin watches for this meta and applies
  // matching rules in a setTimeout — yield once after dispatch.
  // Pass `to` as from so getTextContentFromNodes sees the correct text-before-cursor.
  editor.view.dispatch(editor.state.tr.setMeta("applyInputRules", { from: to, text }))
  await new Promise((r) => setTimeout(r, 0))
}

describe("createBlockSpec — atom NodeView injection", () => {
  it('blocks with content: "" render via NodeView with .rune-side-menu-host slot', () => {
    const AtomBlock = createBlockSpec({
      type: "test-atom",
      content: "",
      parseDOM: [{ tag: "test-atom" }],
      renderDOM: ({ HTMLAttributes }) => [
        "div",
        { ...HTMLAttributes, class: "rune-block" },
        ["hr"],
      ],
      sideMenu: { draggable: true },
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, AtomBlock],
      content: "<test-atom></test-atom>",
    })

    const block = container.querySelector(".rune-block")
    expect(block).not.toBeNull()
    expect(block?.querySelector("hr")).not.toBeNull()
    const host = block?.querySelector(".rune-side-menu-host")
    expect(host).not.toBeNull()
    expect(host?.children.length).toBe(0)

    editor.destroy()
    container.remove()
  })

  it('textblocks (content: "inline*") do NOT get the atom NodeView', () => {
    const TextBlock = createBlockSpec({
      type: "test-textblock",
      content: "inline*",
      parseDOM: [{ tag: "p.test-tb" }],
      renderDOM: ({ HTMLAttributes }) => [
        "p",
        { ...HTMLAttributes, class: "rune-block test-tb" },
        0,
      ],
      sideMenu: { draggable: true },
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, TextBlock],
      content: '<p class="test-tb">hello</p>',
    })

    const block = container.querySelector(".rune-block")
    expect(block).not.toBeNull()
    expect(block?.querySelector(".rune-side-menu-host")).toBeNull()
    editor.destroy()
    container.remove()
  })

  it("atom NodeView's root DOM picks up data-id after BlockId fills it", async () => {
    const AtomWithId = createBlockSpec({
      type: "test-atom-id",
      content: "",
      parseDOM: [{ tag: "test-atom-id" }],
      renderDOM: ({ HTMLAttributes }) => [
        "div",
        { ...HTMLAttributes, class: "rune-block" },
        ["hr"],
      ],
      sideMenu: { draggable: true },
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, AtomWithId, BlockId.configure({ types: ["test-atom-id"] })],
      content: "<test-atom-id></test-atom-id>",
    })
    await new Promise((r) => requestAnimationFrame(r))

    const block = container.querySelector(".rune-block") as HTMLElement
    expect(block).not.toBeNull()
    const dataId = block.getAttribute("data-id")
    expect(dataId).not.toBeNull()
    expect(dataId).toMatch(/.+/)

    editor.destroy()
    container.remove()
  })

  it("atom NodeView preserves per-block prop attrs from props.renderHTML (initial mount)", () => {
    const AtomWithSrc = createBlockSpec({
      type: "test-atom-src",
      content: "",
      props: {
        src: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-src") ?? "",
          renderHTML: (a): Record<string, string> => {
            if (!a.src) return {}
            return { "data-src": a.src as string, class: "prop-class-must-not-sync" }
          },
        },
      },
      parseDOM: [{ tag: "test-atom-src" }],
      renderDOM: ({ HTMLAttributes }) => [
        "div",
        { ...HTMLAttributes, class: "rune-block" },
        ["hr"],
      ],
      sideMenu: { draggable: true },
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, AtomWithSrc],
      content: '<test-atom-src data-src="x.png"></test-atom-src>',
    })

    const block = container.querySelector(".rune-block") as HTMLElement
    expect(block).not.toBeNull()
    expect(block.getAttribute("data-src")).toBe("x.png")

    editor.destroy()
    container.remove()
  })

  it("atom NodeView recreates on attr update so root prop attrs update and remove", () => {
    const AtomWithSrc = createBlockSpec({
      type: "test-atom-src-update",
      content: "",
      props: {
        src: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-src") ?? "",
          renderHTML: (a): Record<string, string> => {
            if (!a.src) return {}
            return { "data-src": a.src as string }
          },
        },
      },
      parseDOM: [{ tag: "test-atom-src-update" }],
      renderDOM: ({ HTMLAttributes }) => [
        "div",
        { ...HTMLAttributes, class: "rune-block" },
        ["hr"],
      ],
      sideMenu: { draggable: true },
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, AtomWithSrc],
      content: '<test-atom-src-update data-src="x.png"></test-atom-src-update>',
    })

    const block = () => container.querySelector(".rune-block") as HTMLElement
    expect(block().getAttribute("data-src")).toBe("x.png")
    expect(block().classList.contains("rune-block")).toBe(true)
    expect(block().classList.contains("prop-class-must-not-sync")).toBe(false)

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(0, undefined, {
        ...editor.state.doc.firstChild!.attrs,
        src: "y.png",
      }),
    )
    expect(block().getAttribute("data-src")).toBe("y.png")
    expect(block().classList.contains("rune-block")).toBe(true)
    expect(block().classList.contains("prop-class-must-not-sync")).toBe(false)

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(0, undefined, {
        ...editor.state.doc.firstChild!.attrs,
        src: "",
      }),
    )
    expect(block().hasAttribute("data-src")).toBe(false)
    expect(block().classList.contains("rune-block")).toBe(true)

    editor.destroy()
    container.remove()
  })

  it("atom NodeView absorbs a value-equal attr rewrite without recreating", () => {
    // PM's AttrStep always builds a fresh attrs object, even when the new
    // value === the old one (e.g. re-clicking the pressed alignment
    // option). That must NOT rebuild the NodeView — a rebuild unmounts
    // chrome portaled inside it (the media floating bar) mid-interaction.
    const AtomWithSrc = createBlockSpec({
      type: "test-atom-noop-attr",
      content: "",
      props: {
        src: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-src") ?? "",
          renderHTML: (a): Record<string, string> =>
            a.src ? { "data-src": a.src as string } : {},
        },
      },
      parseDOM: [{ tag: "test-atom-noop-attr" }],
      renderDOM: ({ HTMLAttributes }) => [
        "div",
        { ...HTMLAttributes, class: "rune-block" },
        ["hr"],
      ],
      sideMenu: { draggable: true },
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, AtomWithSrc],
      content: '<test-atom-noop-attr data-src="x.png"></test-atom-noop-attr>',
    })

    const before = container.querySelector(".rune-block") as HTMLElement
    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "src", "x.png"))
    expect(container.querySelector(".rune-block")).toBe(before)

    editor.destroy()
    container.remove()
  })

  it("atom NodeView recreates on attr update so child DOM derived from attrs stays fresh", () => {
    const AtomWithChildSrc = createBlockSpec({
      type: "test-atom-child-src",
      content: "",
      props: {
        src: {
          default: "",
          parseHTML: (el) => el.querySelector("img")?.getAttribute("src") ?? "",
        },
      },
      parseDOM: [{ tag: "test-atom-child-src" }],
      renderDOM: ({ node, HTMLAttributes }) => [
        "div",
        { ...HTMLAttributes, class: "rune-block" },
        ["img", { src: node.attrs.src as string }],
      ],
      sideMenu: { draggable: true },
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, AtomWithChildSrc],
      content: '<test-atom-child-src><img src="x.png"></test-atom-child-src>',
    })

    const img = () => container.querySelector(".rune-block img") as HTMLImageElement
    expect(img().getAttribute("src")).toBe("x.png")

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(0, undefined, {
        ...editor.state.doc.firstChild!.attrs,
        src: "y.png",
      }),
    )
    expect(img().getAttribute("src")).toBe("y.png")

    editor.destroy()
    container.remove()
  })

  it("atom NodeView re-runs Tiptap global attribute renderHTML on attr update", () => {
    const AtomWithGlobal = createBlockSpec({
      type: "test-atom-global",
      content: "",
      parseDOM: [{ tag: "test-atom-global" }],
      renderDOM: ({ HTMLAttributes }) => [
        "div",
        { ...HTMLAttributes, class: "rune-block" },
        ["hr"],
      ],
      sideMenu: { draggable: true },
    })
    const GlobalAtomAttrs = Extension.create({
      name: "global-atom-attrs",
      addGlobalAttributes() {
        return [
          {
            types: ["test-atom-global"],
            attributes: {
              tone: {
                default: "",
                parseHTML: (el: HTMLElement) => el.getAttribute("data-tone") ?? "",
                renderHTML: (attrs: Record<string, unknown>) =>
                  attrs.tone ? { "data-tone": attrs.tone as string } : {},
              },
            },
          },
        ]
      },
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, GlobalAtomAttrs, AtomWithGlobal],
      content: '<test-atom-global data-tone="cold"></test-atom-global>',
    })

    const block = () => container.querySelector(".rune-block") as HTMLElement
    expect(block().getAttribute("data-tone")).toBe("cold")

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(0, undefined, {
        ...editor.state.doc.firstChild!.attrs,
        tone: "warm",
      }),
    )
    expect(block().getAttribute("data-tone")).toBe("warm")

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(0, undefined, {
        ...editor.state.doc.firstChild!.attrs,
        tone: "",
      }),
    )
    expect(block().hasAttribute("data-tone")).toBe(false)

    editor.destroy()
    container.remove()
  })
})

describe("createBlockSpec — extension priority", () => {
  it("createBlockExtension: priority threads through to inner Extension", () => {
    const Block = createBlockSpec({
      type: "priorityProbe",
      content: "inline*",
      parseDOM: [{ tag: "p.probe" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
      extensions: [
        createBlockExtension({
          key: "probe-keys",
          priority: 1234,
          keyboardShortcuts: { "Mod-Alt-q": () => true },
        }),
      ],
    })
    const editor = new Editor({ extensions: [Document, Text, Block] })
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "priorityProbe--probe-keys",
    )
    expect(ext).toBeDefined()
    expect(ext!.options).toBeDefined()
    expect((ext as any).config.priority ?? ext!.options.priority ?? 100).toBe(1234)
    editor.destroy()
  })
})

describe("createBlockSpec — AnyExtension pass-through", () => {
  it("returns already-built Tiptap extensions directly from block-owned extensions", () => {
    const Companion = Extension.create({
      name: "directCompanion",
      addStorage() {
        return { marker: true }
      },
    })
    const Host = createBlockSpec({
      type: "directHost",
      content: "inline*",
      parseDOM: [{ tag: "p[data-direct-host]" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
      extensions: [Companion],
    })
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Text, Host],
    })

    const companion = editor.extensionManager.extensions.find(
      (ext) => ext.name === "directCompanion",
    )
    expect(companion).toBeDefined()
    expect(companion?.storage).toMatchObject({ marker: true })
    // Should NOT be wrapped in a generated "directHost--directCompanion" extension
    expect(
      editor.extensionManager.extensions.some(
        (ext) => ext.name === "directHost--directCompanion",
      ),
    ).toBe(false)

    editor.destroy()
  })

  it("supports mixing declarative and pre-built extensions in the same block", () => {
    const Companion = Extension.create({
      name: "mixedCompanion",
      addStorage() {
        return { mixed: true }
      },
    })
    const MixedHost = createBlockSpec({
      type: "mixedHost",
      content: "inline*",
      parseDOM: [{ tag: "p[data-mixed-host]" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
      extensions: [
        createBlockExtension({
          key: "mixed-keys",
          keyboardShortcuts: { "Mod-Alt-7": () => true },
        }),
        Companion,
      ],
    })
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Text, MixedHost],
    })

    // Declarative extension gets namespaced
    expect(
      editor.extensionManager.extensions.some(
        (ext) => ext.name === "mixedHost--mixed-keys",
      ),
    ).toBe(true)
    // Pre-built extension keeps its original name
    expect(
      editor.extensionManager.extensions.some(
        (ext) => ext.name === "mixedCompanion",
      ),
    ).toBe(true)
    expect(
      editor.extensionManager.extensions.find(
        (ext) => ext.name === "mixedCompanion",
      )?.storage,
    ).toMatchObject({ mixed: true })

    editor.destroy()
  })
})

describe("createBlockSpec — schemaContext JSON sanitization", () => {
  // Reads the sanitized schemaContext off the block's storage (the public
  // path that runs sanitizeJson / isJsonSafeValue inside the factory).
  function sanitizedSchemaContext(spec: ReturnType<typeof createBlockSpec>, name: string) {
    const editor = new Editor({ extensions: [Document, Text, spec] })
    const storage = editor.extensionManager.extensions.find((e) => e.name === name)
      ?.storage as { schemaContext?: any }
    const ctx = storage?.schemaContext
    editor.destroy()
    return ctx
  }

  it("preserves a shared (acyclic) object instance reused across sibling positions", () => {
    // A DAG: the SAME object instance appears under two different sibling
    // input examples. Path-based cycle detection must keep BOTH; a single
    // shared `seen` set across the whole walk would drop the second.
    const shared = { color: "red" }
    const Block = createBlockSpec({
      type: "dag-block",
      content: "inline*",
      schemaContext: {
        examples: [
          {
            input: { type: "dag-block", a: shared } as unknown as import("./types").RuneSchemaContextInputExample,
          },
          {
            input: { type: "dag-block", b: shared } as unknown as import("./types").RuneSchemaContextInputExample,
          },
        ],
      },
      parseDOM: [{ tag: "div.dag-block" }],
      renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, 0],
    })

    const ctx = sanitizedSchemaContext(Block, "dag-block")
    expect(ctx?.examples?.[0]?.input?.a).toEqual({ color: "red" })
    expect(ctx?.examples?.[1]?.input?.b).toEqual({ color: "red" })
  })

  it("breaks a true cycle without throwing or infinite-looping", () => {
    type Cyclic = { kind: string; self?: Cyclic }
    const cyclic: Cyclic = { kind: "self-ref" }
    cyclic.self = cyclic
    const Block = createBlockSpec({
      type: "cycle-block",
      content: "inline*",
      schemaContext: {
        examples: [
          {
            input: { type: "cycle-block", loop: cyclic } as unknown as import("./types").RuneSchemaContextInputExample,
          },
        ],
      },
      parseDOM: [{ tag: "div.cycle-block" }],
      renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, 0],
    })

    const ctx = sanitizedSchemaContext(Block, "cycle-block")
    // The non-cyclic field survives; the back-edge into the cycle is dropped.
    expect(ctx?.examples?.[0]?.input?.loop?.kind).toBe("self-ref")
    expect(ctx?.examples?.[0]?.input?.loop?.self).toBeUndefined()
    expect(() => JSON.stringify(ctx)).not.toThrow()
  })
})

describe("createBlockSpec — indent", () => {
  it("stores explicit numeric indent config on block storage", () => {
    const Para = createBlockSpec({
      type: "paragraph",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
      indent: { mode: "numeric", maxDepth: 2 },
    })
    const editor = new Editor({ extensions: [Document, Text, Para] })
    const meta = editor.extensionManager.extensions.find((e) => e.name === "paragraph")?.storage as { indent?: { mode: string; maxDepth: number } }
    expect(meta?.indent).toEqual({ mode: "numeric", maxDepth: 2 })
    editor.destroy()
  })

  it("stores explicit structural indent config", () => {
    const Bullet = createBlockSpec({
      type: "bulletList",
      content: "inline*",
      parseDOM: [{ tag: "ul > li" }],
      renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, ["p", {}, 0]],
      indent: { mode: "structural" },
    })
    const editor = new Editor({ extensions: [Document, Text, Bullet] })
    const meta = editor.extensionManager.extensions.find((e) => e.name === "bulletList")?.storage as { indent?: { mode: string } }
    expect(meta?.indent).toEqual({ mode: "structural" })
    editor.destroy()
  })

  it("leaves indent undefined when omitted (consumer applies default)", () => {
    const Plain = createBlockSpec({
      type: "paragraph",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
    })
    const editor = new Editor({ extensions: [Document, Text, Plain] })
    const meta = editor.extensionManager.extensions.find((e) => e.name === "paragraph")?.storage as { indent?: unknown }
    expect(meta?.indent).toBeUndefined()
    editor.destroy()
  })
})

describe("createBlockSpec — registration-time validation", () => {
  it("throws when an inPlaceAttrs.attr names no declared prop", () => {
    expect(() =>
      createBlockSpec({
        type: "test-validate-typo",
        content: "",
        props: { contentWidth: { default: null, renderHTML: () => ({}) } },
        // Typo: prop is "contentWidth". Without the registration-time check
        // this would silently never match in absorbAttrChange — every change
        // rebuilds the NodeView and the symptom (chrome unmounting
        // mid-interaction) surfaces far from the cause.
        inPlaceAttrs: [{ attr: "contentwidth", applyToDOM: () => {} }],
        parseDOM: [{ tag: "test-validate-typo" }],
        renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, ["hr"]],
      }),
    ).toThrowError(/test-validate-typo.*contentwidth/)
  })

  it("accepts inPlaceAttrs naming declared props or the shared id/depth attrs", () => {
    expect(() =>
      createBlockSpec({
        type: "test-validate-ok",
        content: "",
        props: { tint: { default: "none", renderHTML: () => ({}) } },
        inPlaceAttrs: [
          { attr: "tint", applyToDOM: () => {} },
          // id/depth are factory-level attrs (not in config.props) but are
          // legitimate in-place targets — the factory renders them as
          // data-id / data-depth on the root.
          { attr: "id", applyToDOM: () => {} },
          { attr: "depth", applyToDOM: () => {} },
        ],
        parseDOM: [{ tag: "test-validate-ok" }],
        renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, ["hr"]],
      }),
    ).not.toThrow()
  })

  it("throws when supports.resize is declared without resizeMediaSelector", () => {
    expect(() =>
      createBlockSpec({
        type: "test-validate-resize",
        content: "",
        supports: { resize: true },
        parseDOM: [{ tag: "test-validate-resize" }],
        renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, ["hr"]],
      }),
    ).toThrowError(/test-validate-resize.*resizeMediaSelector/)
  })

  it("accepts supports.resize with a resizeMediaSelector", () => {
    expect(() =>
      createBlockSpec({
        type: "test-validate-resize-ok",
        content: "",
        supports: { resize: true },
        resizeMediaSelector: "img[data-test-media]",
        parseDOM: [{ tag: "test-validate-resize-ok" }],
        renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, ["hr"]],
      }),
    ).not.toThrow()
  })
})
