// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export function nearestScrollOwner(start: HTMLElement): HTMLElement | Window {
  let el: HTMLElement | null = start
  while (el) {
    const style = getComputedStyle(el)
    if (/(auto|scroll)/.test(style.overflowY)) return el
    el = el.parentElement
  }
  return window
}

export function scrollViewport(owner: HTMLElement | Window, dy: number) {
  if (owner === window) {
    window.scrollBy(0, dy)
    return
  }
  ;(owner as HTMLElement).scrollTop += dy
}
