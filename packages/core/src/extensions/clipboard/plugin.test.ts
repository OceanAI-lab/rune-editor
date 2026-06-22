// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createRuneKit as kit } from "../../kit"
import { clipboardPluginKey } from "./plugin"

describe("Clipboard extension wired into kit", () => {
  it("registers the plugin under clipboardPluginKey", () => {
    const editor = new Editor({ extensions: kit(), element: document.createElement("div") })
    const found = editor.view.state.plugins.find((p) => p.spec.key === clipboardPluginKey)
    expect(found).toBeDefined()
    editor.destroy()
  })

  it("default kit exposes all five clipboard props on the plugin", () => {
    const editor = new Editor({ extensions: kit(), element: document.createElement("div") })
    const plugin = editor.view.state.plugins.find((p) => p.spec.key === clipboardPluginKey)!
    const props = plugin.props as any
    expect(typeof props.handlePaste).toBe("function")
    expect(typeof props.transformPastedHTML).toBe("function")
    expect(typeof props.clipboardTextParser).toBe("function")
    expect(props.clipboardSerializer).toBeDefined()
    expect(typeof props.handleDOMEvents.copy).toBe("function")
    expect(typeof props.handleDOMEvents.cut).toBe("function")
    editor.destroy()
  })

  it("lets kit clipboard options wrap the html serializer", () => {
    let called = false
    const editor = new Editor({
      extensions: kit({
        clipboard: {
          clipboardSerializer: (base) => {
            called = true
            return base
          },
        },
      }),
      element: document.createElement("div"),
    })

    expect(called).toBe(true)

    const plugin = editor.view.state.plugins.find((p) => p.spec.key === clipboardPluginKey)!
    expect(plugin.props.clipboardSerializer).toBeDefined()
    editor.destroy()
  })
})
