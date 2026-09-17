import type { ViewProps } from "react-native";

import type { SkImage, SkPicture, SkRect, SkSize } from "../skia/types";

export type NativeSkiaViewProps = ViewProps & {
  debug?: boolean;
  opaque?: boolean;
};

/**
 * Presentation statistics of a view (benchmark helper): frames that reached
 * the screen and the timestamps of the most recent ones, in milliseconds on
 * the clock returned by `now`.
 */
export interface SkPresentStats {
  presented: number;
  timestamps: number[];
  now: number;
}

/** Process-wide resource usage (benchmark helper). */
export interface SkProcessStats {
  /** CPU time consumed by all threads of the process, in milliseconds. */
  cpuTimeMs: number;
  residentMemoryBytes: number;
  now: number;
}

export interface ISkiaViewApi {
  web?: boolean;
  setJsiProperty: <T>(nativeId: number, name: string, value: T) => void;
  requestRedraw: (nativeId: number) => void;
  makeImageSnapshot: (nativeId: number, rect?: SkRect) => SkImage;
  makeImageSnapshotAsync: (nativeId: number, rect?: SkRect) => Promise<SkImage>;
  size: (nativeId: number) => SkSize;
  getPresentStats: (nativeId: number) => SkPresentStats;
  /** Milliseconds on the steady clock used by getPresentStats. */
  now: () => number;
  /**
   * True while a recording handed to the view has not been presented yet:
   * producing another one now would only replace it (backpressure).
   */
  hasPendingRecording: (nativeId: number) => boolean;
  getProcessStats: () => SkProcessStats;
}

export interface SkiaBaseViewProps extends ViewProps {
  /**
   * When set to true the view will display information about the
   * average time it takes to render.
   */
  debug?: boolean;

  opaque?: boolean;

  /**
   * Renders into a surface with more than 8 bits per channel (16-bit float on
   * iOS, 10-bit on Android) to avoid banding in subtle gradients. On Android
   * the extra precision survives composition only when combined with `opaque`.
   */
  highBitDepth?: boolean;

  // On web, only 16 WebGL contextes are allowed. If the drawing is non-animated, set
  // __destroyWebGLContextAfterRender to true to release the context after each draw.
  __destroyWebGLContextAfterRender?: boolean;
}

export interface SkiaPictureViewNativeProps extends SkiaBaseViewProps {
  picture?: SkPicture;
  androidWarmup?: boolean;
}
