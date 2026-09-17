/* global HTMLCanvasElement, ResizeObserver */
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { ViewProps } from "react-native";
import type { GrDirectContext, WebGLContextHandle } from "canvaskit-wasm";

import type { SkDeferredTargetInfo, SkImage, SkRect } from "../skia/types";
import { JsiSkSurface } from "../skia/web/JsiSkSurface";
import type { JsiSkRecording } from "../skia/web/JsiSkRecording";
import { Platform } from "../Platform";
import type { ISkiaViewApiWeb } from "../specs/NativeSkiaModule.web";

import { SkiaViewNativeId } from "./SkiaViewNativeId";

export interface SkiaRecordingViewHandle {
  setRecording(recording: JsiSkRecording | null): void;
  getSize(): { width: number; height: number };
  redraw(): void;
  makeImageSnapshot(rect?: SkRect): SkImage | null;
}

export interface SkiaRecordingViewWebProps extends ViewProps {
  nativeID?: string;
  highBitDepth?: boolean;
  onTarget?: (target: SkDeferredTargetInfo) => void;
}

/**
 * Web fallback: the recording token wraps a raster surface, and this view
 * draws that surface's snapshot into a WebGL surface of the canvas element.
 * The target it reports is the canvas size in device pixels.
 */
export const SkiaRecordingView = (props: SkiaRecordingViewWebProps) => {
  const { onTarget, nativeID } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<JsiSkSurface | null>(null);
  const grContextRef = useRef<GrDirectContext | null>(null);
  const contextHandleRef = useRef<WebGLContextHandle>(0);
  const recordingRef = useRef<JsiSkRecording | null>(null);
  const lastTargetRef = useRef<SkDeferredTargetInfo | null>(null);
  const onTargetRef = useRef(onTarget);
  useLayoutEffect(() => {
    onTargetRef.current = onTarget;
  }, [onTarget]);

  const draw = useCallback(() => {
    const surface = surfaceRef.current;
    const recording = recordingRef.current;
    if (!surface || !recording) {
      return;
    }
    const target = lastTargetRef.current;
    if (
      !target ||
      recording.width !== target.width ||
      recording.height !== target.height
    ) {
      // Target mismatch: drop the frame, the producer has the new target.
      recordingRef.current = null;
      return;
    }
    const image = recording.makeImageSnapshot();
    if (!image) {
      return;
    }
    const canvas = surface.getCanvas();
    canvas.clear(Float32Array.of(0, 0, 0, 0));
    canvas.drawImage(image, 0, 0);
    image.dispose();
    surface.flush();
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const grContext = grContextRef.current;
    if (!canvas || !grContext) {
      return;
    }
    const pd = window.devicePixelRatio;
    const width = Math.floor(canvas.clientWidth * pd);
    const height = Math.floor(canvas.clientHeight * pd);
    canvas.width = width;
    canvas.height = height;
    surfaceRef.current?.dispose();
    surfaceRef.current = null;
    if (width === 0 || height === 0) {
      return;
    }
    const surface = CanvasKit.MakeOnScreenGLSurface(
      grContext,
      width,
      height,
      CanvasKit.ColorSpace.SRGB
    );
    if (!surface) {
      throw new Error("Could not create surface");
    }
    surfaceRef.current = new JsiSkSurface(CanvasKit, surface);
    const previous = lastTargetRef.current;
    if (
      !previous ||
      previous.width !== width ||
      previous.height !== height
    ) {
      const target = { width, height, highBitDepth: false };
      lastTargetRef.current = target;
      onTargetRef.current?.(target);
    }
    draw();
  }, [draw]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const handle = CanvasKit.GetWebGLContext(canvas);
    if (!handle) {
      throw new Error("Could not create a WebGL context");
    }
    const grContext = CanvasKit.MakeWebGLContext(handle);
    if (!grContext) {
      throw new Error("Could not create a graphics context");
    }
    contextHandleRef.current = handle;
    grContextRef.current = grContext;
    resize();
    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      surfaceRef.current?.dispose();
      surfaceRef.current = null;
      grContext.releaseResourcesAndAbandonContext();
      grContext.delete();
      grContextRef.current = null;
      CanvasKit.deleteContext(handle);
      contextHandleRef.current = 0;
    };
  }, [resize]);

  useEffect(() => {
    const id = nativeID ?? `${SkiaViewNativeId.current++}`;
    const api = global.SkiaViewApi as ISkiaViewApiWeb;
    const handle: SkiaRecordingViewHandle = {
      setRecording: (recording) => {
        recordingRef.current = recording;
        draw();
      },
      getSize: () => ({
        width: canvasRef.current?.clientWidth ?? 0,
        height: canvasRef.current?.clientHeight ?? 0,
      }),
      redraw: draw,
      makeImageSnapshot: (rect?: SkRect) => {
        const surface = surfaceRef.current;
        if (!surface) {
          return null;
        }
        draw();
        const pd = window.devicePixelRatio;
        return surface.makeImageSnapshot(
          rect
            ? {
                x: rect.x * pd,
                y: rect.y * pd,
                width: rect.width * pd,
                height: rect.height * pd,
              }
            : undefined
        );
      },
    };
    api.registerRecordingView(id, handle);
    return () => {
      api.unregisterView(id);
    };
  }, [draw, nativeID]);

  const {
    onTarget: _onTarget,
    highBitDepth: _highBitDepth,
    nativeID: _nativeID,
    ...viewProps
  } = props;
  return (
    <Platform.View {...viewProps}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </Platform.View>
  );
};
