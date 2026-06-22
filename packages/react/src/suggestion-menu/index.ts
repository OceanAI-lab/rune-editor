// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export { SuggestionMenuController } from "./SuggestionMenuController";
export { SuggestionMenuPopover } from "./SuggestionMenuPopover";
export { DefaultSuggestionMenu } from "./defaultRenderer";
export { getDefaultReactSlashMenuItems } from "./getDefaultReactSlashMenuItems";
export { ComponentsContext, useComponentsContext, defaultComponents } from "./ComponentsContext";
export type { RuneComponentProps } from "./ComponentsContext";
export type {
  DefaultReactSuggestionItem,
  DefaultReactGridSuggestionItem,
  SuggestionMenuProps,
  SuggestionMenuPopoverProps,
} from "./types";
export { RuneSlashMenu } from "./presets/RuneSlashMenu";
export { RuneEmojiPicker } from "./presets/RuneEmojiPicker";
export type { RuneEmojiPickerProps } from "./presets/RuneEmojiPicker";
export { RuneLinkMenu } from "./presets/RuneLinkMenu";
export { RuneMentionMenu } from "./presets/RuneMentionMenu";

// Hooks — exposed for power users.
export { useSuggestionMenuState } from "./hooks/useSuggestionMenuState";
export { useLoadSuggestionMenuItems } from "./hooks/useLoadSuggestionMenuItems";
export { useSuggestionMenuKeyboard } from "./hooks/useSuggestionMenuKeyboard";
