// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Hover-driven submenu state for native menus. Owns the open-delay /
// close-grace timers so multiple consumers (BlockActionsDropdown,
// TableActionsDropdown, future surfaces) share one implementation.
//
// Usage:
//   const submenu = useNativeMenuSubmenu()
//   <div {...submenu.triggerProps} aria-expanded={submenu.isOpen}>
//     Color
//     {submenu.isOpen ? <div {...submenu.contentProps}><ColorMenu .../></div> : null}
//   </div>
//
// Caller is responsible for resetting the submenu when the parent menu
// closes (call `submenu.close()` in an effect that watches the parent's
// open state). The hook does not introspect parent state.

import { useEffect, useRef, useState, useCallback, useMemo } from "react"

export interface UseNativeMenuSubmenuOptions {
  /** Delay before opening on row hover. Defaults to 100ms. */
  openDelayMs?: number
  /** Grace period after leaving row/panel before close. Defaults to 140ms. */
  closeDelayMs?: number
}

export interface NativeMenuSubmenu {
  isOpen: boolean
  /** Spread on the row that triggers the submenu. */
  triggerProps: {
    onMouseEnter: () => void
    onMouseLeave: () => void
  }
  /** Spread on the submenu content panel — keeps it open while the user is hovering it. */
  contentProps: {
    onMouseEnter: () => void
    onMouseLeave: () => void
  }
  /** Force-close (e.g., when the parent menu closes). */
  close: () => void
}

export function useNativeMenuSubmenu(
  options?: UseNativeMenuSubmenuOptions,
): NativeMenuSubmenu {
  const openDelay = options?.openDelayMs ?? 100
  const closeDelay = options?.closeDelayMs ?? 140
  const [isOpen, setIsOpen] = useState(false)
  const timerRef = useRef<number | null>(null)

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleOpen = useCallback(() => {
    cancelTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setIsOpen(true)
    }, openDelay)
  }, [cancelTimer, openDelay])

  const keepOpen = useCallback(() => {
    cancelTimer()
    setIsOpen((prev) => (prev ? prev : true))
  }, [cancelTimer])

  const scheduleClose = useCallback(() => {
    cancelTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setIsOpen(false)
    }, closeDelay)
  }, [cancelTimer, closeDelay])

  const close = useCallback(() => {
    cancelTimer()
    setIsOpen(false)
  }, [cancelTimer])

  useEffect(() => () => cancelTimer(), [cancelTimer])

  const triggerProps = useMemo(
    () => ({ onMouseEnter: scheduleOpen, onMouseLeave: scheduleClose }),
    [scheduleOpen, scheduleClose],
  )
  const contentProps = useMemo(
    () => ({ onMouseEnter: keepOpen, onMouseLeave: scheduleClose }),
    [keepOpen, scheduleClose],
  )

  // Memoize the returned object so consumers can safely list `submenu`
  // in `useEffect` deps without re-firing every render. Without this,
  // a parent reset effect like `useEffect(() => { ... }, [dropdownId,
  // submenu])` would run on every render even when `dropdownId` is
  // unchanged.
  return useMemo(
    () => ({ isOpen, triggerProps, contentProps, close }),
    [isOpen, triggerProps, contentProps, close],
  )
}
