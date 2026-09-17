import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Skia,
  SkiaRecordingView,
  setViewRecording,
} from "@shopify/react-native-skia";
import type {
  SkDeferredTargetInfo,
  SkiaRecordingViewRef,
} from "@shopify/react-native-skia";
import {
  useFrameCallback,
  useSharedValue,
  runOnJS,
} from "react-native-reanimated";

const n = 20;
const paint = Skia.Paint();

// A frame recorded on the UI thread against the target the view reported.
// Everything (pipeline selection, tessellation, uniform uploads) happens in
// snap() on this thread; the main thread only binds the swapchain texture and
// submits.
const recordFrame = (target: SkDeferredTargetInfo, t: number) => {
  "worklet";
  const { width, height } = target;
  const canvas = Skia.Context.makeDeferredCanvas(target);
  // The deferred canvas starts with the previous contents of the target.
  canvas.clear(Skia.Color("#101418"));
  const size = Math.min(width, height);
  const angle = (t / 3000) * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const alpha = Math.pow((i + 1) / n, 5) * 200;
    const r = ((i + 1) / n) * (size / 4);
    const offset = ((i + 1) / n) * (size / 4);
    const cx = width / 2 + Math.cos(angle + (i * Math.PI * 2) / n) * offset;
    const cy = height / 2 + Math.sin(angle + (i * Math.PI * 2) / n) * offset;
    paint.setColor(Skia.Color(`rgba(0, 122, 255, ${alpha / 255})`));
    canvas.drawCircle(cx, cy, r, paint);
  }
  return Skia.Context.snap();
};

export const Recording = () => {
  const ref = useRef<SkiaRecordingViewRef>(null);
  const target = useSharedValue<SkDeferredTargetInfo | null>(null);
  const nativeId = useSharedValue(-1);
  const frames = useSharedValue(0);
  const lastReport = useSharedValue(0);
  const [fps, setFps] = React.useState(0);

  useEffect(() => {
    if (ref.current) {
      nativeId.value = ref.current.nativeId;
    }
  }, [nativeId]);

  useFrameCallback((frame) => {
    "worklet";
    const t = target.value;
    if (!t || nativeId.value < 0) {
      return;
    }
    const recording = recordFrame(t, frame.timestamp);
    setViewRecording(nativeId.value, recording);
    // The view shares ownership of the recording: dropping the JS handle
    // right away is safe even before it was presented.
    recording.dispose();
    frames.value += 1;
    if (frame.timestamp - lastReport.value >= 1000) {
      const value = Math.round(
        (frames.value * 1000) / (frame.timestamp - lastReport.value)
      );
      frames.value = 0;
      lastReport.value = frame.timestamp;
      runOnJS(setFps)(value);
    }
  });

  return (
    <View style={styles.container}>
      <SkiaRecordingView ref={ref} style={styles.view} onTarget={target} />
      <Text style={styles.label}>{`${fps} recordings/s (UI thread)`}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101418" },
  view: { flex: 1 },
  label: {
    color: "white",
    padding: 16,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
});
