import type { ViewProps } from "react-native";
import { createElement } from "react";

import { SkiaRecordingView } from "../views/SkiaRecordingView.web";
import type { SkDeferredTargetInfo } from "../skia/types";

export type TargetEvent = Readonly<{
  width: number;
  height: number;
  highBitDepth: boolean;
}>;

export interface NativeProps extends ViewProps {
  debug?: boolean;
  opaque?: boolean;
  highBitDepth?: boolean;
  onTarget?: (event: { nativeEvent: TargetEvent }) => void;
  nativeID: string;
}

const SkiaRecordingViewNativeComponent = ({
  nativeID,
  highBitDepth,
  onTarget,
  ...viewProps
}: NativeProps) => {
  return createElement(SkiaRecordingView, {
    nativeID,
    highBitDepth,
    onTarget: onTarget
      ? (target: SkDeferredTargetInfo) =>
          onTarget({
            nativeEvent: {
              width: target.width,
              height: target.height,
              highBitDepth: target.highBitDepth === true,
            },
          })
      : undefined,
    ...viewProps,
  });
};
// eslint-disable-next-line import/no-default-export
export default SkiaRecordingViewNativeComponent;
