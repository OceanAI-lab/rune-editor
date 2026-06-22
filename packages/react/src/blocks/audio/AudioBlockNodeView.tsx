// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useEffect, useRef } from "react"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import {
  MEDIA_PLACEHOLDER_LABELS,
  syncMenuSlot,
  syncResizeSlot,
} from "@ocai/rune-core"
import { AudioLines } from "lucide-react"
import { mergeNodeViewHTMLAttributes } from "../../nodeview/htmlAttributes"
import { AudioPlayer } from "./AudioPlayer"

// Value lives in rune-tokens.css (--rune-media-pad-top) so the core and
// React render paths can't drift (#298).
const AUDIO_PAD_TOP = "var(--rune-media-pad-top)"

function AudioBlockNodeView(props: ReactNodeViewProps<HTMLDivElement>) {
  const { editor, node, decorations, getPos, HTMLAttributes } = props
  const attrs = node.attrs as {
    sourceType: "asset" | "embed"
    src: string
    embedUrl: string | null
    provider: "soundcloud" | null
    title: string
    contentWidth: number | null
  }

  const isEmbed = attrs.sourceType === "embed" && attrs.embedUrl
  const isAsset = !isEmbed && attrs.src
  const isEmpty = !isEmbed && !isAsset

  const { className, style, rest } = mergeNodeViewHTMLAttributes(
    HTMLAttributes,
    {
      // rune-media-empty keys the shared Notion-style empty bar CSS —
      // the core renderDOM path (renderEmptyMediaDOM) emits the same class.
      className: isEmpty ? "rune-audio rune-media-empty" : "rune-audio",
      styleVars: { "--block-pad-top": AUDIO_PAD_TOP },
    },
  )

  const hostRef = useRef<HTMLDivElement>(null)
  const resizeHostRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (hostRef.current) {
      syncMenuSlot(hostRef.current, decorations, editor, getPos)
    }
  }, [decorations, editor, getPos])

  useEffect(() => {
    if (resizeHostRef.current && rootRef.current) {
      syncResizeSlot(resizeHostRef.current, rootRef.current, node, editor)
    }
  }, [node, editor])

  const contentStyle = {
    width: attrs.contentWidth != null ? `${attrs.contentWidth}%` : "100%",
  }

  return (
    <NodeViewWrapper
      ref={rootRef}
      as="div"
      className={className}
      style={style}
      {...rest}
    >
      <div
        className="rune-block-content"
        style={contentStyle}
        {...(attrs.contentWidth != null
          ? { "data-rune-resized": "" }
          : {})}
      >
        {isEmpty ? (
          <div className="rune-media-empty-control">
            <div className="rune-media-empty-icon">
              <AudioLines className="rune-media-empty-icon-svg" style={{ fill: "none" }} />
            </div>
            <span className="rune-media-empty-label">
              {MEDIA_PLACEHOLDER_LABELS.audio}
            </span>
          </div>
        ) : isEmbed ? (
          <iframe
            src={attrs.embedUrl!}
            title={attrs.title || "soundcloud"}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            data-rune-media-embed=""
            allow="autoplay"
          />
        ) : (
          <AudioPlayer src={attrs.src} title={attrs.title || undefined} />
        )}
        <div ref={resizeHostRef} className="rune-resize-host" />
      </div>
      <div ref={hostRef} className="rune-side-menu-host" />
    </NodeViewWrapper>
  )
}

export const audioBlockReactNodeView = ReactNodeViewRenderer(
  AudioBlockNodeView,
  { className: "rune-block" },
)
