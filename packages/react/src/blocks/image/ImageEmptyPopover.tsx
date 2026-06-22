// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import { SourceBlockPopover } from "../media/MediaSourcePopover"
import { SOURCE_BLOCK_CONFIGS } from "../media/config"

export interface ImageEmptyPopoverProps {
  editor: Editor
}

export function ImageEmptyPopover({ editor }: ImageEmptyPopoverProps) {
  return (
    <SourceBlockPopover
      editor={editor}
      configs={[SOURCE_BLOCK_CONFIGS.image]}
      dataAttribute="data-rune-image-popover"
    />
  )
}
