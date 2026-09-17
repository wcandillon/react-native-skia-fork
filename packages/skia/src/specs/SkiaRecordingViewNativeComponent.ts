import { codegenNativeComponent, type ViewProps } from "react-native";
import type {
  DirectEventHandler,
  Int32,
  WithDefault,
} from "react-native/Libraries/Types/CodegenTypes";

// The swapchain target of the view, in pixels. Fired once when the surface
// exists and again whenever it changes.
export type TargetEvent = Readonly<{
  width: Int32;
  height: Int32;
  highBitDepth: boolean;
}>;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - pointerEvents needs to be redeclared for codegen to generate native bindings
export interface NativeProps extends ViewProps {
  debug?: boolean;
  opaque?: boolean;
  highBitDepth?: boolean;
  onTarget?: DirectEventHandler<TargetEvent>;
  pointerEvents?: WithDefault<
    "auto" | "none" | "box-none" | "box-only",
    "auto"
  >;
}

// eslint-disable-next-line import/no-default-export
export default codegenNativeComponent<NativeProps>("SkiaRecordingView");
