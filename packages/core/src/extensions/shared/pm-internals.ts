// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { EditorView } from "@tiptap/pm/view"

type PMDomObserver = {
  stop(): void
  start(): void
  flush?: () => void
}

// PM does not expose domObserver in its public types, but the
// instance is on every EditorView and is the canonical way to
// suspend DOM-to-PM selection sync during a synchronous click
// handler. Cast through unknown so the dependency is local.
export function domObserverOf(view: EditorView): PMDomObserver {
  return (view as unknown as { domObserver: PMDomObserver }).domObserver
}

export function flushDomObserver(view: EditorView): void {
  const obs = (view as unknown as { domObserver?: PMDomObserver }).domObserver
  obs?.flush?.()
}
