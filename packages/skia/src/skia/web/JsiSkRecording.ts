import type { CanvasKit } from "canvaskit-wasm";

import type { SkImage, SkRecording } from "../types";

import { BaseHostObject } from "./Host";
import type { JsiSkSurface } from "./JsiSkSurface";

/**
 * Web fallback of a recording: a token around the raster surface that
 * makeDeferredCanvas() drew into. The view draws that surface's snapshot.
 */
export class JsiSkRecording
  extends BaseHostObject<JsiSkSurface | null, "Recording">
  implements SkRecording
{
  constructor(
    CanvasKit: CanvasKit,
    surface: JsiSkSurface | null,
    public readonly width: number,
    public readonly height: number,
    public readonly highBitDepth: boolean
  ) {
    super(CanvasKit, surface, "Recording");
  }

  /** Whether a deferred canvas was recorded (views reject the others). */
  get hasTarget() {
    return this.ref !== null;
  }

  /** The frame's pixels, or null if nothing was recorded or disposed. */
  makeImageSnapshot(): SkImage | null {
    if (this.ref === null || this.disposed) {
      return null;
    }
    this.ref.flush();
    return this.ref.makeImageSnapshot();
  }

  private disposed = false;

  [Symbol.dispose]() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.ref?.dispose();
    this.ref = null;
  }
}
