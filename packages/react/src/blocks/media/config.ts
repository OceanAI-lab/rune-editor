// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { ComponentType } from "react"
import { AudioIcon, ImageBlockIcon, VideoIcon } from "../../icons"
import type { IconProps } from "../../icons"

export type ReactSourceBlockKind = "image" | "video" | "audio"

export interface ReactSourceBlockConfig {
  kind: ReactSourceBlockKind
  nodeName: string
  blockSelector: string
  emptyClassName: string
  accept: string
  icon: ComponentType<IconProps>
  labels: {
    addTitle: string
    replaceTitle: string
    fileInput: string
    uploadButton: string
    urlInput: string
    embedButton: string
    invalidUrl: string
    missingFileHook: string
  }
}

export const SOURCE_BLOCK_CONFIGS = {
  image: {
    kind: "image",
    nodeName: "image",
    blockSelector: ".rune-block.rune-image[data-id]",
    emptyClassName: "rune-image-empty",
    accept: "image/*",
    icon: ImageBlockIcon,
    labels: {
      addTitle: "Add an image",
      replaceTitle: "Replace image",
      fileInput: "Choose image file",
      uploadButton: "Choose image file",
      urlInput: "Image URL",
      embedButton: "Embed image",
      invalidUrl: "Enter a valid image URL",
      missingFileHook: "Host must wire importImageFile or importMediaFile",
    },
  },
  video: {
    kind: "video",
    nodeName: "video",
    blockSelector: ".rune-block.rune-video[data-id]",
    emptyClassName: "rune-media-empty",
    accept: "video/*",
    icon: VideoIcon,
    labels: {
      addTitle: "Add a video",
      replaceTitle: "Replace video",
      fileInput: "Choose video file",
      uploadButton: "Choose video file",
      urlInput: "Video URL",
      embedButton: "Embed video",
      invalidUrl: "Enter a valid video URL",
      missingFileHook: "Host must wire importMediaFile",
    },
  },
  audio: {
    kind: "audio",
    nodeName: "audio",
    blockSelector: ".rune-block.rune-audio[data-id]",
    emptyClassName: "rune-media-empty",
    accept: "audio/*",
    icon: AudioIcon,
    labels: {
      addTitle: "Add audio",
      replaceTitle: "Replace audio",
      fileInput: "Choose audio file",
      uploadButton: "Choose audio file",
      urlInput: "Audio URL",
      embedButton: "Embed audio",
      invalidUrl: "Enter a valid audio URL",
      missingFileHook: "Host must wire importMediaFile",
    },
  },
} satisfies Record<ReactSourceBlockKind, ReactSourceBlockConfig>

export const DEFAULT_SOURCE_BLOCK_CONFIGS = [
  SOURCE_BLOCK_CONFIGS.image,
  SOURCE_BLOCK_CONFIGS.video,
  SOURCE_BLOCK_CONFIGS.audio,
] as const
