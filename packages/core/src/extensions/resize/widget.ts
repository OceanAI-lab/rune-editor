// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export type ResizeHandleSide = "start" | "end"

export function buildResizeHandles(): HTMLElement[] {
  return [buildHandle("start"), buildHandle("end")]
}

function buildHandle(side: ResizeHandleSide): HTMLElement {
  const handle = document.createElement("div")
  handle.className = `rune-resize-handle rune-resize-handle--${side}`

  const pill = document.createElement("div")
  pill.className = "rune-resize-pill"
  handle.appendChild(pill)

  return handle
}
