// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Capture-phase `selectstart` guard for MBS gestures.
 *
 * While an MBS gesture is active, Chrome's drag-text-selection logic will build
 * a native Selection range that PM's DOMObserver later flushes back as a
 * TextSelection dispatch — overwriting our MBS. Arming this guard installs a
 * capture-phase preventDefault on `document`, so the native range is never
 * created in the first place.
 *
 * Capture phase is load-bearing: bubbling listeners run after the browser has
 * already started the selection. `begin()` / `end()` are idempotent so call
 * sites can arm/disarm without tracking state.
 */
export function createSelectStartGuard(): {
  begin(): void
  end(): void
  destroy(): void
} {
  let active = false

  const onSelectStart = (event: Event) => {
    event.preventDefault()
  }

  const end = () => {
    if (!active) return
    active = false
    document.removeEventListener("selectstart", onSelectStart, true)
  }

  return {
    begin() {
      if (active) return
      active = true
      document.addEventListener("selectstart", onSelectStart, true)
    },
    end,
    destroy: end,
  }
}
