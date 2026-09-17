import type { SkCanvas } from "./Canvas";
import type { SkJSIInstance } from "./JsiInstance";

/**
 * Description of the texture a recording is made for. Sizes are in pixels
 * (not points): use the value reported by SkiaRecordingView's onTarget.
 */
export interface SkDeferredTargetInfo {
  width: number;
  height: number;
  /**
   * Selects the swapchain format (16-bit float on Apple, 10-bit on Android).
   * Defaults to false. The view reports the bit depth that is actually in
   * use, which may fall back to 8-bit on devices without support.
   */
  highBitDepth?: boolean;
}

/**
 * A finished frame: everything recorded on the producing thread since the
 * previous snap(), ready to be presented by a SkiaRecordingView whose target
 * matches width, height and highBitDepth exactly.
 */
export interface SkRecording extends SkJSIInstance<"Recording"> {
  /** Target width in pixels (0 when no deferred canvas was recorded). */
  readonly width: number;
  /** Target height in pixels (0 when no deferred canvas was recorded). */
  readonly height: number;
  readonly highBitDepth: boolean;
}

export interface ContextFactory {
  /**
   * True when recordings can be produced and presented (native Graphite
   * builds). False on Ganesh builds and on web, where only the raster
   * fallback of makeDeferredCanvas()/snap() exists.
   */
  readonly isSupported: boolean;
  /**
   * Returns a canvas that records against a texture described by `info`
   * (the texture itself is bound by the view at presentation time). The
   * canvas draws in pixels, starts with the previous contents of the target
   * (call clear() for a clean frame) and is invalid after snap(). At most one
   * deferred canvas can be open per thread: snap() before the next call.
   */
  makeDeferredCanvas(info: SkDeferredTargetInfo): SkCanvas;
  /**
   * Snaps everything recorded on the calling thread since the last snap(),
   * including the open deferred canvas, into a recording. A recording made
   * without a deferred canvas carries no target and is rejected by views.
   */
  snap(): SkRecording;
  /**
   * Sets the scheduling priority of the calling thread. A worklet runtime
   * that produces frames should call this once with "high" from its own
   * thread: runtimes start at normal priority, which on big.LITTLE devices
   * means the little cores. No-op on web.
   */
  setThreadPriority(level: "high" | "normal" | "low"): void;
}
