// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export { SuggestionMenus } from "./SuggestionMenus";
export { getSuggestionMenus } from "./getSuggestionMenus";
export { dismissSuggestionMenu } from "./dismissSuggestionMenu";
export { wikiLinkMatcher } from "./matchers/wikiLinkMatcher";
export { slashMatcher } from "./matchers/slashMatcher";
export {
  recordSuggestionUse,
  getSuggestionFrequency,
  pickRecentlyUsed,
} from "./frequency";
export type {
  TriggerConfig,
  TriggerState,
  TriggerStore,
  TriggerKeyHandler,
  SuggestionMenusOptions,
  SuggestionMenusStorage,
  FrequencyEntry,
  FrequencyMap,
} from "./types";
export * from "./default-items";
