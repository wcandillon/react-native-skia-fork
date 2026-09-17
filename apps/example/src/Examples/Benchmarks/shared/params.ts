import { useRoute } from "@react-navigation/native";

import type { Mode } from "./api";

/**
 * Screen params, for automation (deep links, initialParams): start in a
 * mode and start the run without a tap.
 */
export interface BenchParams {
  mode?: Mode;
  autoRun?: boolean;
  /** Animated list only: start with auto-scroll on or off. */
  autoScroll?: boolean;
}

export const useBenchParams = (): BenchParams => {
  const route = useRoute();
  return (route.params as BenchParams | undefined) ?? {};
};
