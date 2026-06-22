// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { MathIcon } from "../icons"

// Empty-state placeholder for the inline math NodeView (Notion-style
// muted pill with the radical icon + a "New equation" label). Rendered
// when the node's latex is empty so the user always has a visible
// click target — KaTeX's empty-input output is an invisible wrapper.
// The actual KaTeX render replaces this whenever latex becomes
// non-empty.
export function MathEmptyState() {
  return (
    <span className="rune-math-empty" aria-hidden="true">
      <MathIcon size={14} />
      <span className="rune-math-empty-label">New equation</span>
    </span>
  )
}
