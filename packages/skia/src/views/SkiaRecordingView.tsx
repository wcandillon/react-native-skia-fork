import React, { useCallback, useImperativeHandle, useMemo } from "react";
import type { ViewProps } from "react-native";

import type {
  SkDeferredTargetInfo,
  SkImage,
  SkRecording,
  SkRect,
} from "../skia/types";
import SkiaRecordingViewNativeComponent from "../specs/SkiaRecordingViewNativeComponent";
import type { TargetEvent } from "../specs/SkiaRecordingViewNativeComponent";

import { SkiaViewApi } from "./api";
import { SkiaViewNativeId } from "./SkiaViewNativeId";

/** Something with a `value` slot, e.g. a Reanimated SharedValue. */
interface TargetSink {
  value: SkDeferredTargetInfo | null;
}

export interface SkiaRecordingViewProps extends ViewProps {
  debug?: boolean;
  opaque?: boolean;
  /**
   * Selects a swapchain with more than 8 bits per channel. The bit depth in
   * use is reported by onTarget (it falls back to 8-bit on devices without
   * support).
   */
  highBitDepth?: boolean;
  /**
   * Fires with the current target (pixels and effective bit depth) whenever
   * it changes, including once right after mount, before the first frame can
   * be presented. Either a callback or a SharedValue to assign to.
   */
  onTarget?: ((target: SkDeferredTargetInfo) => void) | TargetSink;
  ref?: React.Ref<SkiaRecordingViewRef>;
}

export interface SkiaRecordingViewRef {
  /** Id to pass to {@link setViewRecording} from a worklet. */
  readonly nativeId: number;
  /**
   * Sets the recording to present at the next vsync. Recordings that arrive
   * within one vsync are coalesced: the latest is presented, the others are
   * released. `null` releases the frames the view holds (the screen keeps its
   * last contents).
   */
  setRecording(recording: SkRecording | null): void;
  /**
   * Replays the latest recording into an offscreen texture and reads it back.
   * Rect in points.
   */
  makeImageSnapshot(rect?: SkRect): SkImage;
  makeImageSnapshotAsync(rect?: SkRect): Promise<SkImage>;
}

/**
 * Worklet-safe way to hand a recording to a view without a React commit:
 * usable from the UI thread with the view's nativeId.
 */
export const setViewRecording = (
  nativeId: number,
  recording: SkRecording | null
) => {
  "worklet";
  SkiaViewApi.setJsiProperty(nativeId, "recording", recording);
};

export const SkiaRecordingView = ({
  debug = false,
  opaque = false,
  highBitDepth = false,
  onTarget,
  ref,
  ...viewProps
}: SkiaRecordingViewProps) => {
  const nativeId = useMemo(() => SkiaViewNativeId.current++, []);

  useImperativeHandle(
    ref,
    () => ({
      nativeId,
      setRecording: (recording: SkRecording | null) => {
        assertSkiaViewApi();
        SkiaViewApi.setJsiProperty(nativeId, "recording", recording);
      },
      makeImageSnapshot: (rect?: SkRect) => {
        assertSkiaViewApi();
        return SkiaViewApi.makeImageSnapshot(nativeId, rect);
      },
      makeImageSnapshotAsync: (rect?: SkRect) => {
        assertSkiaViewApi();
        return SkiaViewApi.makeImageSnapshotAsync(nativeId, rect);
      },
    }),
    [nativeId]
  );

  const onNativeTarget = useCallback(
    (event: { nativeEvent: TargetEvent }) => {
      if (!onTarget) {
        return;
      }
      const { width, height, highBitDepth: effectiveHighBitDepth } =
        event.nativeEvent;
      const target: SkDeferredTargetInfo = {
        width,
        height,
        highBitDepth: effectiveHighBitDepth,
      };
      if (typeof onTarget === "function") {
        onTarget(target);
      } else {
        onTarget.value = target;
      }
    },
    [onTarget]
  );

  return (
    <SkiaRecordingViewNativeComponent
      collapsable={false}
      nativeID={`${nativeId}`}
      debug={debug}
      opaque={opaque}
      highBitDepth={highBitDepth}
      onTarget={onTarget ? onNativeTarget : undefined}
      {...viewProps}
    />
  );
};

const assertSkiaViewApi = () => {
  if (
    SkiaViewApi === null ||
    SkiaViewApi.setJsiProperty === null ||
    SkiaViewApi.makeImageSnapshot === null
  ) {
    throw Error("Skia View Api was not found.");
  }
};
