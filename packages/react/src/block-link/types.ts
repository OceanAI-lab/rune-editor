// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type {
  InternalRefAttrs,
  InternalRefResolveResult,
} from "@ocai/rune-core"

export interface RuneBlockLinkTarget {
  docId: string
  blockId: string
  href: string
  refTarget: string
}

export type ParseRuneBlockLink = (href: string) => RuneBlockLinkTarget | null

export interface ResolveRuneRefContext {
  editor: Editor
  attrs: InternalRefAttrs
}

export type RuneRefResolveResult = InternalRefResolveResult

export type ResolveRuneRef = (
  ctx: ResolveRuneRefContext,
) => RuneRefResolveResult | null | Promise<RuneRefResolveResult | null>

export interface OpenRuneRefContext {
  editor: Editor
  attrs: InternalRefAttrs
  event: MouseEvent
}

export type OpenRuneRef = (ctx: OpenRuneRefContext) => void

export interface OpenRuneBlockLinkContext {
  editor: Editor
  target: RuneBlockLinkTarget
  event: MouseEvent
}

export type OpenRuneBlockLink = (ctx: OpenRuneBlockLinkContext) => void
