// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Empty placeholder for equationBlock. Matches Notion's
 * `T_EX Add a TeX equation` pill (muted background, full-width).
 *
 * The "T_EX" glyph is plain text styled with the KaTeX serif font —
 * pulling KaTeX just to draw three letters is wasteful, and three
 * sub-tag DOM nodes are cheaper to mount than a 200-line KaTeX HTML
 * fragment. `aria-hidden` keeps screen readers from announcing
 * "T sub E X" — the visible label "Add a TeX equation" is the
 * accessible name.
 */
export function MathBlockEmptyState() {
  return (
    <div className="rune-math-empty-block">
      <span className="rune-math-empty-block-glyph" aria-hidden="true">
        T<sub>E</sub>X
      </span>
      <span className="rune-math-empty-block-label">Add a TeX equation</span>
    </div>
  )
}
