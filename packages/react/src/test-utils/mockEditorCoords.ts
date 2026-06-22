// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"

// JSDOM has no layout engine, so `view.coordsAtPos` (which floating
// popovers/menus use to anchor themselves) returns 0/0/0/0. Stub it with
// a fixed non-degenerate rect so popover positioning code doesn't break.
// Tests that care about exact coords should override locally.
export function mockEditorCoords(editor: Editor): void {
  editor.view.coordsAtPos = () => ({
    left: 10,
    right: 10,
    top: 10,
    bottom: 26,
  })
}
