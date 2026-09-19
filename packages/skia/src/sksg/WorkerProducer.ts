import type { SharedValue } from "react-native-reanimated";
import type { WorkletRuntime } from "react-native-worklets";

import Worklets from "../external/worklets/WorkletsProxy";
import type { JsiRecorder, SkDeferredTargetInfo, Skia } from "../skia/types";
import { Platform } from "../Platform";

import "../skia/NativeSetup";
import "../views/api";

// create local reference for `strictGlobal` option in Worklets
const { SkiaViewApi } = globalThis;

/**
 * The producer thread of the recording renderer.
 *
 * One worklet runtime, a real background thread, records every canvas that
 * renders through a SkiaRecordingView. The main thread only presents. Each
 * canvas is a slot: its JsiRecorder (the declarative scene, swapped on every
 * React render), the shared values that animate it, the target the view
 * reported and a version number that the UI runtime bumps whenever any of
 * those change (a cheap mapper; no drawing happens on the UI runtime).
 *
 * The loop wakes once per frame while something changed, and re-records a
 * slot when its version moved past the one last drawn. A view that still
 * holds an unpresented recording is skipped for now (backpressure): all of
 * Skia's work happens in snap(), so recording a frame that would only be
 * replaced is wasted, and since the loop polls, the latest state is drawn on
 * the next frame anyway.
 */

interface WorkerSlot {
  recorder: JsiRecorder | null;
  values: SharedValue<unknown>[];
  target: SharedValue<SkDeferredTargetInfo | null>;
  version: SharedValue<number>;
  drawn: number;
}

interface WorkerState {
  slots: Map<number, WorkerSlot>;
  looping: boolean;
}

// Lives on the worker runtime's global: the slots must only be touched from
// that thread, which runOnRuntime guarantees.
const getState = (): WorkerState => {
  "worklet";
  const g = globalThis as unknown as { __rnskiaProducer?: WorkerState };
  if (!g.__rnskiaProducer) {
    g.__rnskiaProducer = { slots: new Map(), looping: false };
  }
  return g.__rnskiaProducer;
};

// Records every slot whose inputs changed. Returns true when some slot still
// has work (changed but its view has not presented the previous frame).
const produce = (Skia: Skia, pixelDensity: number) => {
  "worklet";
  const state = getState();
  let busy = false;
  state.slots.forEach((slot, nativeId) => {
    const target = slot.target.value;
    const recorder = slot.recorder;
    if (!target || !recorder) {
      return;
    }
    const version = slot.version.value;
    if (version === slot.drawn) {
      return;
    }
    if (SkiaViewApi.hasPendingRecording(nativeId)) {
      busy = true;
      return;
    }
    recorder.applyUpdates(slot.values);
    const canvas = Skia.Context.makeDeferredCanvas(target);
    canvas.clear(Float32Array.of(0, 0, 0, 0));
    canvas.save();
    canvas.scale(pixelDensity, pixelDensity);
    recorder.draw(canvas);
    canvas.restore();
    const recording = Skia.Context.snap();
    SkiaViewApi.setJsiProperty(nativeId, "recording", recording);
    // The view shares ownership of the recording.
    recording.dispose();
    slot.drawn = version;
    busy = true;
  });
  return busy;
};

const startLoop = (Skia: Skia, pixelDensity: number) => {
  "worklet";
  const state = getState();
  if (state.looping) {
    return;
  }
  state.looping = true;
  // Frames are produced here; the thread starts at normal priority, which on
  // big.LITTLE devices means the little cores.
  Skia.Context.setThreadPriority("high");
  const loop = () => {
    if (state.slots.size === 0) {
      state.looping = false;
      return;
    }
    const busy = produce(Skia, pixelDensity);
    if (busy) {
      // Something is animating or waiting for a present: check again as
      // soon as the runtime's animation queue polls.
      requestAnimationFrame(loop);
    } else {
      // Idle: one cheap wake-up per frame to notice the next change.
      setTimeout(loop, 16);
    }
  };
  loop();
};

const addSlot = (
  nativeId: number,
  target: SharedValue<SkDeferredTargetInfo | null>,
  version: SharedValue<number>
) => {
  "worklet";
  getState().slots.set(nativeId, {
    recorder: null,
    values: [],
    target,
    version,
    drawn: -1,
  });
};

const setSlotRecorder = (
  nativeId: number,
  recorder: JsiRecorder,
  values: SharedValue<unknown>[]
) => {
  "worklet";
  const slot = getState().slots.get(nativeId);
  if (!slot) {
    return;
  }
  // The previous recorder is released with its JS handle; the loop never
  // holds one across iterations, so nothing is drawing it.
  slot.recorder = recorder;
  slot.values = values;
  slot.drawn = -1;
};

const removeSlot = (nativeId: number) => {
  "worklet";
  getState().slots.delete(nativeId);
};

class WorkerProducer {
  private runtime: WorkletRuntime | null = null;

  private getRuntime() {
    if (this.runtime === null) {
      this.runtime = Worklets.createWorkletRuntime({
        name: "react-native-skia-producer",
        // The worker's requestAnimationFrame is a polled timer, not vsync:
        // poll often so a batch starts right after the UI frame that changed
        // the inputs. The loop only spins while something changed.
        animationQueuePollingRate: 4,
      });
    }
    return this.runtime;
  }

  register(
    nativeId: number,
    target: SharedValue<SkDeferredTargetInfo | null>,
    version: SharedValue<number>
  ) {
    Worklets.runOnRuntime(this.getRuntime(), addSlot)(nativeId, target, version);
  }

  publish(
    Skia: Skia,
    nativeId: number,
    recorder: JsiRecorder,
    values: SharedValue<unknown>[]
  ) {
    const runtime = this.getRuntime();
    Worklets.runOnRuntime(runtime, setSlotRecorder)(nativeId, recorder, values);
    Worklets.runOnRuntime(runtime, startLoop)(Skia, Platform.PixelRatio);
  }

  unregister(nativeId: number) {
    Worklets.runOnRuntime(this.getRuntime(), removeSlot)(nativeId);
  }
}

export const workerProducer = new WorkerProducer();
