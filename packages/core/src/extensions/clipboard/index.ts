// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from "@tiptap/core"
import { createClipboardPlugin, type ClipboardOptions } from "./plugin"

/**
 * The Clipboard extension. Single PM Plugin holding all clipboard props
 * (handleDOMEvents.copy/cut, handlePaste, transformPastedHTML,
 * clipboardTextParser, clipboardSerializer).
 */
export const Clipboard = Extension.create<ClipboardOptions>({
  name: "clipboard",
  addOptions() {
    return {}
  },
  addProseMirrorPlugins() {
    return [createClipboardPlugin(this.editor, this.options)]
  },
})

export { collectKnownBlockTags } from "./knownBlockTags"
export { serializeBlocksForClipboard } from "./serializeBlocks"
export { markdownToDoc } from "./markdownToDoc"
export type { ParseHTML } from "./markdownToDoc"
export { markdownToHtml } from "./markdownToHtml"
export type { ClipboardOptions } from "./plugin"
