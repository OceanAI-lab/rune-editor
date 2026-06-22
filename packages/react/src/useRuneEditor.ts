// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useEditor } from "@tiptap/react"
import type { Editor, EditorOptions, AnyExtension } from "@tiptap/react"
import { createRuneKit, type CreateRuneKitOptions } from "@ocai/rune-core"
import type {
  RuneImportImageFile,
  RuneImportImageUrl,
  RuneImportMediaFile,
  RuneImportMediaUrl,
} from "@ocai/rune-core"
import type { DependencyList } from "react"
import { reactMathNodeViews } from "./math/kitOptions"
import { reactBlockNodeViews } from "./toc-block"

export interface UseRuneEditorOptions
  extends Omit<Partial<EditorOptions>, "extensions"> {
  /** Extra Tiptap extensions appended after the Rune kit. */
  extensions?: AnyExtension[]
  /** Forwarded to createRuneKit (e.g., custom blockIdTypes). */
  kit?: CreateRuneKitOptions
  /** Host-owned media import hook for File inputs. */
  importMediaFile?: RuneImportMediaFile
  /** Host-owned media import hook for URL inputs. */
  importMediaUrl?: RuneImportMediaUrl
  /** Host-owned image import hook for File inputs. */
  importImageFile?: RuneImportImageFile
  /** Host-owned image import hook for URL inputs. */
  importImageUrl?: RuneImportImageUrl
}

// useRuneEditor is a thin wrapper over Tiptap's useEditor that
// pre-composes the Rune extension kit. Anything you can pass to
// useEditor you can pass here, minus `extensions` which gets merged
// (Rune kit first, then yours so you can override).
//
// `deps` is forwarded verbatim — Tiptap rebuilds the editor when it
// changes. Default is an empty array (build once).
export function useRuneEditor(
  options: UseRuneEditorOptions = {},
  deps: DependencyList = [],
): Editor | null {
  const {
    extensions = [],
    kit,
    importMediaFile,
    importMediaUrl,
    importImageFile,
    importImageUrl,
    ...rest
  } = options
  const mergedKit: CreateRuneKitOptions = {
    ...kit,
    importMediaFile: importMediaFile ?? kit?.importMediaFile,
    importMediaUrl: importMediaUrl ?? kit?.importMediaUrl,
    importImageFile: importImageFile ?? kit?.importImageFile,
    importImageUrl: importImageUrl ?? kit?.importImageUrl,
    mathNodeViews: {
      ...reactMathNodeViews(),
      ...kit?.mathNodeViews,
    },
    blockNodeViews: {
      ...reactBlockNodeViews(),
      ...kit?.blockNodeViews,
    },
  }
  return useEditor(
    {
      ...rest,
      extensions: [...createRuneKit(mergedKit), ...extensions],
    },
    deps,
  )
}
