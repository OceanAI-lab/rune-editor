// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { onTestFinished } from "vitest"
import { Editor, type EditorOptions } from "@tiptap/core"
import { createRuneKit, type CreateRuneKitOptions } from "../kit"

/**
 * Construct a Tiptap `Editor` for tests and register a per-test cleanup
 * so the editor is destroyed when the surrounding `it` finishes.
 *
 * Without the cleanup, ProseMirror's `DOMObserver` can schedule a
 * `Timeout._onTimeout` flush that fires AFTER vitest tears down jsdom,
 * crashing with `ReferenceError: document is not defined` as an
 * unhandled exception. The test itself passes; vitest still exits 1.
 *
 * Defaults to `createRuneKit()`. Pass `extensions` to override entirely,
 * or `kit` to forward options to the default kit. Anything else
 * (`element`, `content`, …) flows straight into the `Editor` ctor.
 */
export interface CreateTestEditorOptions extends Partial<EditorOptions> {
  /** Options forwarded to `createRuneKit`. Ignored if `extensions` is set. */
  kit?: CreateRuneKitOptions
}

export function createTestEditor(opts: CreateTestEditorOptions = {}): Editor {
  const { kit, extensions, ...rest } = opts
  const editor = new Editor({
    extensions: extensions ?? createRuneKit(kit),
    ...rest,
  })
  onTestFinished(() => {
    if (!editor.isDestroyed) editor.destroy()
  })
  return editor
}
