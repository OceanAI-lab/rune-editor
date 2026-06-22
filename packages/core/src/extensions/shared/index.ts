// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export { GestureStatePlugin, gestureKey, isGestureActive, claimGesture, isPrimaryRelease, primaryLost } from "./gesture-state"
export type { ActiveGesture, GestureState, GestureName, GestureClaim } from "./gesture-state"
export { domObserverOf, flushDomObserver } from "./pm-internals"
export {
  getEditorVar,
  resolveCssLengthToPx,
  createDragIndicator,
  registerDragCancelHandlers,
} from "./drag-utils"
export { headIndexAtY } from "./head-index"
export { surfaceFromPoint } from "./surface-from-point"
export type { SurfaceRef } from "./surface-from-point"
export { onEditorWrapperMouseDown } from "./wrapper-listener"
export { nearestScrollOwner, scrollViewport } from "./scroll-utils"
export { createSelectStartGuard } from "./selectstart-guard"
