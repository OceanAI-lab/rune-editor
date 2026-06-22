// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useEffect, useRef, useState, type RefObject } from "react"

export type PopoverSide = "top" | "right" | "bottom" | "left"

export interface LockedPopoverSide {
  /**
   * Attach to the Radix PopoverContent / DropdownMenuContent ref. The hook
   * reads `data-side` off the element on the frame after open to lock.
   */
  contentRef: RefObject<HTMLDivElement | null>
  /** Resolved side once Radix has measured collisions; null before. */
  lockedSide: PopoverSide | null
  /**
   * Pass to PopoverContent's `avoidCollisions`. True until the lock is
   * captured (let Radix flip), false after (pin the resolved side).
   */
  avoidCollisions: boolean
}

/**
 * Pin a Radix popover/dropdown to the side Radix picks on first open, so
 * subsequent content-size changes (filter shrink, hover-card → edit-form,
 * sub-popovers expanding) don't make it flip mid-life — the flip jumps
 * the panel over the caret/anchor and is disorienting.
 *
 * Pass a `sessionKey` that's truthy while the popover is mounted and
 * changes when the popover should re-decide its side (closed → reopened,
 * or anchored to a different target). The lock resets when sessionKey
 * changes to null/undefined/false or to a new non-falsy value.
 *
 * Usage:
 *   const { contentRef, lockedSide, avoidCollisions } = useLockedPopoverSide(open)
 *   <PopoverContent
 *     ref={contentRef}
 *     side={lockedSide ?? "bottom"}
 *     avoidCollisions={avoidCollisions}
 *   />
 */
export function useLockedPopoverSide(
  sessionKey: unknown,
): LockedPopoverSide {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [lockedSide, setLockedSide] = useState<PopoverSide | null>(null)

  useEffect(() => {
    // Any sessionKey change clears the prior lock so the next open (or
    // the next anchor) is free to re-decide.
    setLockedSide(null)

    if (!sessionKey) return

    // Wait one frame so Radix/Floating UI has measured collisions and
    // written data-side onto the content element. Reading synchronously
    // here would catch the placeholder "bottom" before the flip lands.
    const raf = requestAnimationFrame(() => {
      const resolved = contentRef.current?.getAttribute("data-side")
      if (
        resolved === "top" ||
        resolved === "right" ||
        resolved === "bottom" ||
        resolved === "left"
      ) {
        setLockedSide(resolved)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [sessionKey])

  return { contentRef, lockedSide, avoidCollisions: lockedSide === null }
}
