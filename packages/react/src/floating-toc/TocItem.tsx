// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { cn } from "../lib/utils"
import type { TocHeading } from "./types"

// Visual bar only — click-to-navigate lives in TocHoverCard. Bars are not
// individual buttons because hover on the column opens the card; clicking
// happens inside the card.

// Bar geometry by internal heading level (2/3/4/5 ↔ UI H1/H2/H3/H4).
// Numbers come from the Notion devtools snapshot — each level drops 4px
// of width and gains 4px of margin-inline-start, so every bar shares the
// same right edge inside the stack column.
const BAR_GEOM: Record<2 | 3 | 4 | 5, { width: number; indent: number }> = {
  2: { width: 16, indent: 0 },
  3: { width: 12, indent: 4 },
  4: { width: 8, indent: 8 },
  5: { width: 4, indent: 12 },
}

export interface TocItemProps {
  item: TocHeading
  /** True when this heading's section is the one the reader has scrolled
   *  to. Driven by scroll-spy in FloatingTableOfContents, not by hover or
   *  click — exactly one bar carries this at any given scroll position. */
  current: boolean
}

export function TocItem({ item, current }: TocItemProps) {
  const { width, indent } = BAR_GEOM[item.level]
  // Slot is a plain block div, NOT flex. Bar is a block span that flows
  // from the slot's inline-start with `margin-inline-start` pushing it
  // right per level. This matches Notion exactly: every bar's right edge
  // lands at slot-start + 16px, leaving the rest of the slot as breathing
  // room before the column's padding-inline-end. The earlier
  // flex+justify-end version pinned bars to the column's right edge,
  // which read as "too close to the viewport".
  return (
    <div
      data-rune-toc-item=""
      data-rune-toc-id={item.id}
      data-rune-toc-current={current ? "" : undefined}
    >
      <span
        style={{
          width,
          marginInlineStart: indent,
          transitionProperty: "background-color, box-shadow",
          transitionDuration: "200ms",
        }}
        // Active bar matches Notion's spec: solid foreground + same-color
        // soft halo (0 0 3px). Tailwind's ring utilities draw a hard ring,
        // so the halo lives in an arbitrary box-shadow value.
        className={cn(
          "block h-0.5 rounded-xs",
          current
            ? "bg-foreground dark:shadow-[0_0_3px_var(--foreground)]"
            : "bg-muted-foreground",
        )}
      />
    </div>
  )
}
