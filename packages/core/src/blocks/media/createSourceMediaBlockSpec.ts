// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { nanoid } from "nanoid"
import type { TagParseRule } from "@tiptap/pm/model"
import { createBlockSpec, mergeBlockHTMLAttributes } from "../../schema"
import type {
  RuneBlockSchemaContextSpec,
  RuneMarkdownBlockSerializer,
} from "../../schema"
import { insertOrUpdateBlockForSlashMenu } from "../../extensions/suggestion-menus"
import {
  applyContentWidthAttrs,
  contentWidthInPlaceAttr,
  inputContentWidthOrDefault,
  normalizeContentWidth,
} from "./contentWidth"
import {
  DEFAULT_MEDIA_ALIGN,
  inputMediaAlignOrDefault,
  mediaAlignInPlaceAttr,
  normalizeMediaAlign,
  parseMediaAlignAttr,
  renderMediaAlignAttr,
  type MediaAlign,
} from "./align"
import { openMediaOriginal, originalMediaUrl } from "./assetActions"
import { iframeAttrs, MEDIA_PAD_TOP, renderEmptyMediaDOM } from "./render"
import {
  isSupportedMediaUrlReference,
  validateMediaImportResult,
  type MediaEmbedProvider,
  type MediaSourceAttrs,
  type MediaSourceType,
  type SourcedBlockKind,
} from "./source"
import {
  contentAttrsFromOuter,
  inputNullableStringOrDefault,
  inputNumberOrDefault,
  inputProviderOrDefault,
  inputSourceTypeOrDefault,
  inputStringOrDefault,
  isProvider,
  numAttr,
  slashSourceDepth,
} from "./source-input-helpers"
import { getMediaImportState } from "./import-plugin"

export type SourceMediaBlockKind = Extract<SourcedBlockKind, "video" | "audio">

export interface SourceMediaAttrs extends MediaSourceAttrs {
  id: string | null
  depth: number
  contentWidth: number | null
  /** Only present on blocks whose config sets `supportsAlign` (video). */
  align?: MediaAlign
}

export interface SourceMediaBlockConfig {
  type: SourceMediaBlockKind
  className: string
  iconPaths: string[]
  allowedProviders: readonly MediaEmbedProvider[]
  assetDataAttr: string
  assetTag: "video" | "audio"
  assetHasDimensions: boolean
  /** Adds the `align` attr + Alignment UI. Video yes; audio renders
   *  full-width and omits it (spec 2026-06-11). */
  supportsAlign: boolean
  slash: {
    key: string
    title: string
    aliases: string[]
    group: string
  }
  extraParseDOM?: TagParseRule[]
  includeContentWidthInOutput: boolean
  toMarkdown?: RuneMarkdownBlockSerializer
  schemaContext?: RuneBlockSchemaContextSpec
  /**
   * Overrides the derived `resizeMediaSelector`
   * (`<assetTag>[<assetDataAttr>], iframe[data-rune-media-embed]`) —
   * e.g. Audio adds its React player wrapper. See
   * `BlockSpecConfig.resizeMediaSelector`.
   */
  resizeMediaSelector?: string
}

type MaybeMediaPopoverCommands = {
  openMediaPopover?: (blockId: string) => boolean
}

function mediaSourceFromElement(
  el: HTMLElement,
  config: Pick<SourceMediaBlockConfig, "assetDataAttr" | "assetTag">,
): string {
  if (el.tagName.toLowerCase() === config.assetTag) {
    return (
      el.getAttribute("src") ||
      el.querySelector<HTMLSourceElement>("source[src]")?.getAttribute("src") ||
      ""
    )
  }

  const media = el.querySelector<HTMLElement>(
    `:scope > .rune-block-content > ${config.assetTag}[${config.assetDataAttr}]`,
  )
  return media ? mediaSourceFromElement(media, config) : ""
}

function validEmbedAttrs(
  config: SourceMediaBlockConfig,
  attrs: SourceMediaAttrs,
): boolean {
  const provider = attrs.provider
  if (
    !provider ||
    !attrs.embedUrl ||
    !attrs.sourceUrl ||
    !config.allowedProviders.includes(provider)
  ) {
    return false
  }

  return validateMediaImportResult(config.type, {
    kind: "embed",
    provider,
    embedUrl: attrs.embedUrl,
    sourceUrl: attrs.sourceUrl,
    title: attrs.title,
    width: attrs.width,
    height: attrs.height,
  }).ok
}

function validAssetAttrs(
  config: SourceMediaBlockConfig,
  attrs: SourceMediaAttrs,
): boolean {
  if (!attrs.src) return false
  return validateMediaImportResult(config.type, {
    kind: "asset",
    src: attrs.src,
    sourceUrl: attrs.sourceUrl ?? undefined,
    title: attrs.title,
    width: attrs.width,
    height: attrs.height,
  }).ok
}

function attrsFromInput({
  config,
  input,
  defaults,
}: {
  config: SourceMediaBlockConfig
  input: { [k: string]: unknown }
  defaults: { depth: number; attrs?: Record<string, unknown> }
}): SourceMediaAttrs | null {
  const sourceType = inputSourceTypeOrDefault(
    input.sourceType,
    defaults.attrs?.sourceType,
  )
  const title = inputStringOrDefault(input.title, defaults.attrs?.title)
  const width = inputNumberOrDefault(input.width, defaults.attrs?.width)
  const height = inputNumberOrDefault(input.height, defaults.attrs?.height)
  const contentWidth = inputContentWidthOrDefault(
    input.contentWidth,
    defaults.attrs?.contentWidth,
  )
  const alignAttrs = config.supportsAlign
    ? { align: inputMediaAlignOrDefault(input.align, defaults.attrs?.align) }
    : {}

  if (sourceType === "embed") {
    const provider = inputProviderOrDefault(input.provider, defaults.attrs?.provider)
    const embedUrl = inputNullableStringOrDefault(
      input.embedUrl,
      defaults.attrs?.embedUrl,
    )
    const sourceUrl = inputNullableStringOrDefault(
      input.sourceUrl,
      defaults.attrs?.sourceUrl,
    )

    const attrs = {
      ...defaults.attrs,
      id: input.id ?? null,
      depth: input.depth ?? defaults.depth,
      sourceType,
      src: "",
      embedUrl,
      provider,
      sourceUrl,
      title,
      width,
      height,
      contentWidth,
      ...alignAttrs,
    } as SourceMediaAttrs

    return validEmbedAttrs(config, attrs) ? attrs : null
  }

  const attrs = {
    ...defaults.attrs,
    id: input.id ?? null,
    depth: input.depth ?? defaults.depth,
    sourceType: "asset" as const,
    src: inputStringOrDefault(input.src, defaults.attrs?.src),
    embedUrl: null,
    provider: null,
    sourceUrl: inputNullableStringOrDefault(
      input.sourceUrl,
      defaults.attrs?.sourceUrl,
    ),
    title,
    width,
    height,
    contentWidth,
    ...alignAttrs,
  } as SourceMediaAttrs

  if (attrs.src && !validAssetAttrs(config, attrs)) return null
  return attrs
}

function genericAssetParseDOM(config: SourceMediaBlockConfig): TagParseRule {
  return {
    tag: config.assetTag === "video" ? "video" : "audio[src]",
    getAttrs: (el) => {
      const media = el as HTMLElement
      const src = mediaSourceFromElement(media, config)
      if (!src || !isSupportedMediaUrlReference(src)) return false
      return {
        sourceType: "asset",
        src,
        embedUrl: null,
        provider: null,
        sourceUrl: null,
        title: media.getAttribute("title") ?? "",
        width: config.assetHasDimensions ? numAttr(media, "width") : null,
        height: config.assetHasDimensions ? numAttr(media, "height") : null,
      }
    },
  }
}

function renderEmptySourceMedia(
  config: SourceMediaBlockConfig,
  outer: Record<string, any>,
  contentAttrs: Record<string, string>,
) {
  return renderEmptyMediaDOM(config.type, outer, contentAttrs, config.iconPaths)
}

function renderSourceMediaOuterAttrs(
  config: SourceMediaBlockConfig,
  outer: Record<string, any>,
) {
  return mergeBlockHTMLAttributes(outer, {
    className: config.className,
    styleVars: { "--block-pad-top": MEDIA_PAD_TOP },
  })
}

function embedDOMAttrs(
  config: SourceMediaBlockConfig,
  attrs: SourceMediaAttrs,
): Record<string, string> {
  const out = iframeAttrs(attrs.provider!, attrs.embedUrl!, attrs.title)
  if (config.type === "video") {
    out["data-rune-source-url"] = attrs.sourceUrl!
  }
  if (config.assetHasDimensions) {
    if (attrs.width != null) out.width = String(attrs.width)
    if (attrs.height != null) out.height = String(attrs.height)
  }
  return out
}

function assetDOMAttrs(
  config: SourceMediaBlockConfig,
  attrs: SourceMediaAttrs,
): Record<string, string> {
  return {
    src: attrs.src,
    controls: "",
    [config.assetDataAttr]: "",
    ...(attrs.title ? { title: attrs.title } : {}),
    ...(config.assetHasDimensions && attrs.width != null
      ? { width: String(attrs.width) }
      : {}),
    ...(config.assetHasDimensions && attrs.height != null
      ? { height: String(attrs.height) }
      : {}),
  }
}

export function createSourceMediaBlockSpec(config: SourceMediaBlockConfig) {
  return createBlockSpec({
    type: config.type,
    content: "",
    props: {
      sourceType: {
        default: "asset" as MediaSourceType,
        renderHTML: () => ({}),
      },
      src: {
        default: "",
        parseHTML: (el) => mediaSourceFromElement(el, config),
        renderHTML: () => ({}),
      },
      embedUrl: { default: null as string | null, renderHTML: () => ({}) },
      provider: {
        default: null as MediaEmbedProvider | null,
        renderHTML: () => ({}),
      },
      sourceUrl: { default: null as string | null, renderHTML: () => ({}) },
      title: { default: "", renderHTML: () => ({}) },
      width: {
        default: null as number | null,
        parseHTML: (el) =>
          config.assetHasDimensions ? numAttr(el, "width") : null,
        renderHTML: () => ({}),
      },
      height: {
        default: null as number | null,
        parseHTML: (el) =>
          config.assetHasDimensions ? numAttr(el, "height") : null,
        renderHTML: () => ({}),
      },
      contentWidth: { default: null as number | null, renderHTML: () => ({}) },
      ...(config.supportsAlign
        ? {
            align: {
              default: DEFAULT_MEDIA_ALIGN as MediaAlign,
              parseHTML: parseMediaAlignAttr,
              renderHTML: renderMediaAlignAttr,
            },
          }
        : {}),
    },
    supports: {
      backgroundColor: true,
      resize: true,
      mediaSource: true,
      align: config.supportsAlign,
    },
    resizeMediaSelector:
      config.resizeMediaSelector ??
      `${config.assetTag}[${config.assetDataAttr}], iframe[data-rune-media-embed]`,
    inPlaceAttrs: config.supportsAlign
      ? [contentWidthInPlaceAttr, mediaAlignInPlaceAttr]
      : [contentWidthInPlaceAttr],
    schemaContext: config.schemaContext,
    sideMenu: { draggable: true },
    blockActions: () => [
      {
        id: "replace-source",
        label: "Replace",
        icon: "replace",
        isVisible: ({ editor, isSingleBlock, blockId }) => {
          if (!isSingleBlock || !blockId) return false
          return getMediaImportState(editor, blockId)?.phase !== "importing"
        },
        run: ({ editor, blockId }) => {
          if (!blockId) return false
          return editor.commands.openMediaPopover(blockId)
        },
      },
      {
        id: "view-original",
        label: "View original",
        icon: "external-link",
        quickAction: true,
        isVisible: ({ node, isSingleBlock }) =>
          isSingleBlock && originalMediaUrl(node.attrs) !== null,
        run: ({ node }) => {
          const url = originalMediaUrl(node.attrs)
          if (!url) return false
          return openMediaOriginal(url)
        },
      },
    ],
    toMarkdown: config.toMarkdown,
    parseDOM: [
      ...(config.extraParseDOM ?? []),
      genericAssetParseDOM(config),
    ],

    renderDOM({ node, HTMLAttributes }) {
      const attrs = node.attrs as SourceMediaAttrs
      const { outer, contentAttrs } = contentAttrsFromOuter(HTMLAttributes)

      if (attrs.sourceType === "embed") {
        if (!validEmbedAttrs(config, attrs)) {
          return renderEmptySourceMedia(config, outer, contentAttrs)
        }

        const outerAttrs = renderSourceMediaOuterAttrs(config, outer)
        applyContentWidthAttrs(contentAttrs, attrs.contentWidth)
        return [
          "div",
          outerAttrs,
          [
            "div",
            contentAttrs,
            ["iframe", embedDOMAttrs(config, attrs)],
          ],
        ]
      }

      if (!validAssetAttrs(config, attrs)) {
        return renderEmptySourceMedia(config, outer, contentAttrs)
      }

      const outerAttrs = renderSourceMediaOuterAttrs(config, outer)
      applyContentWidthAttrs(contentAttrs, attrs.contentWidth)
      return [
        "div",
        outerAttrs,
        [
          "div",
          contentAttrs,
          [
            config.assetTag,
            assetDOMAttrs(config, attrs),
          ],
        ],
      ]
    },

    clipboardRenderDOM({ node }) {
      const attrs = node.attrs as SourceMediaAttrs
      if (attrs.sourceType === "embed") {
        if (!validEmbedAttrs(config, attrs)) return ["span"]
        return [
          "a",
          { href: attrs.sourceUrl || attrs.embedUrl || "" },
          attrs.title || attrs.sourceUrl || attrs.embedUrl || "",
        ]
      }
      if (!validAssetAttrs(config, attrs)) return ["span"]
      return [
        config.assetTag,
        {
          src: attrs.src,
          controls: "",
          ...(attrs.title ? { title: attrs.title } : {}),
        },
      ]
    },

    toRuneBlock(node) {
      const attrs = node.attrs as SourceMediaAttrs
      const contentWidth = normalizeContentWidth(attrs.contentWidth)
      const align = normalizeMediaAlign(attrs.align)
      return {
        type: config.type,
        id: typeof attrs.id === "string" ? attrs.id : "",
        depth: typeof attrs.depth === "number" ? attrs.depth : 0,
        sourceType: attrs.sourceType === "embed" ? "embed" : "asset",
        src: typeof attrs.src === "string" ? attrs.src : "",
        embedUrl: typeof attrs.embedUrl === "string" ? attrs.embedUrl : null,
        provider: isProvider(attrs.provider) ? attrs.provider : null,
        sourceUrl: typeof attrs.sourceUrl === "string" ? attrs.sourceUrl : null,
        title: typeof attrs.title === "string" ? attrs.title : "",
        width: typeof attrs.width === "number" ? attrs.width : null,
        height: typeof attrs.height === "number" ? attrs.height : null,
        ...(config.includeContentWidthInOutput && contentWidth !== null
          ? { contentWidth }
          : {}),
        ...(config.supportsAlign && align !== DEFAULT_MEDIA_ALIGN
          ? { align }
          : {}),
      }
    },

    fromInput({ schema, input, defaults }) {
      if (input.type !== config.type) return null
      const type = schema.nodes[config.type]
      if (!type) return null
      const attrs = attrsFromInput({ config, input, defaults })
      return attrs ? type.create(attrs) : null
    },

    slashMenuItems: () => [
      {
        key: config.slash.key,
        title: config.slash.title,
        aliases: config.slash.aliases,
        group: config.slash.group,
        onItemClick: (ctx) => {
          if (!ctx.editor.isEditable) return
          const id = nanoid(8)
          insertOrUpdateBlockForSlashMenu(ctx, {
            type: config.type,
            props: { id, depth: slashSourceDepth(ctx) },
          })
          const commands = ctx.editor.commands as typeof ctx.editor.commands &
            MaybeMediaPopoverCommands
          commands.openMediaPopover?.(id)
        },
      },
    ],
  })
}
