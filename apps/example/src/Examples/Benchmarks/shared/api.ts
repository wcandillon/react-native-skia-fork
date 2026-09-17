import { PixelRatio } from "react-native";
import type { ISkiaViewApi } from "@shopify/react-native-skia";

// The view API is a global installed by the native module. Captured here so
// worklets on the UI runtime and on the producer runtime can call it (it is
// a boxable native object like Skia itself).
export const SkiaViewApi = (
  globalThis as unknown as { SkiaViewApi: ISkiaViewApi }
).SkiaViewApi;

export const pixelDensity = PixelRatio.get();

export type Mode = "picture" | "recording";

export const median = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const percentile = (values: number[], p: number) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((p / 100) * (sorted.length - 1)))
  );
  return sorted[index];
};

export const round = (value: number, digits = 1) => {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
};
