import React, { useEffect, useRef, useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import {
  Skia,
  SkiaRecordingView,
  setViewRecording,
} from "@shopify/react-native-skia";
import type {
  SkDeferredTargetInfo,
  SkiaRecordingViewRef,
} from "@shopify/react-native-skia";
import { useFrameCallback, useSharedValue } from "react-native-reanimated";

const paint = Skia.Paint();
const stroke = Skia.Paint();
stroke.setStyle(1);
stroke.setStrokeWidth(6);
stroke.setColor(Skia.Color("white"));

// Draws a frame that makes the target size visible: a border on the target
// edges and a bouncing disc. If a recording is made for a stale target the
// view drops it (mismatch path), fires onTarget again and the next frame
// uses the new size.
const recordFrame = (target: SkDeferredTargetInfo, t: number) => {
  "worklet";
  const { width, height } = target;
  const canvas = Skia.Context.makeDeferredCanvas(target);
  canvas.clear(Skia.Color("#1b2430"));
  canvas.drawRect(Skia.XYWHRect(3, 3, width - 6, height - 6), stroke);
  const r = Math.min(width, height) / 6;
  const x = r + ((Math.sin(t / 500) + 1) / 2) * (width - 2 * r);
  const y = r + ((Math.cos(t / 700) + 1) / 2) * (height - 2 * r);
  paint.setColor(Skia.Color("#ff9f43"));
  canvas.drawCircle(x, y, r, paint);
  return Skia.Context.snap();
};

const sizes = [
  { width: "100%", height: 300 },
  { width: "60%", height: 200 },
  { width: "100%", height: 300 },
  { width: "80%", height: 420 },
] as const;

export const RecordingResize = () => {
  const ref = useRef<SkiaRecordingViewRef>(null);
  const target = useSharedValue<SkDeferredTargetInfo | null>(null);
  const nativeId = useSharedValue(-1);
  const [step, setStep] = useState(0);
  const [reported, setReported] = useState<SkDeferredTargetInfo | null>(null);
  const [highBitDepth, setHighBitDepth] = useState(false);
  const [autoResize, setAutoResize] = useState(true);
  const [mismatches, setMismatches] = useState(0);
  // With the lag on, the worklet keeps recording for the old target for a
  // while after each resize; the view drops those frames (logged once per
  // target in debug builds) and shows nothing until a matching one arrives.
  const [lagTarget, setLagTarget] = useState(true);
  const lagRef = useRef(lagTarget);
  lagRef.current = lagTarget;

  // Cycle through the sizes while the worklet keeps producing frames: every
  // resize makes the frames recorded for the old target mismatch until the
  // new target reaches the worklet.
  useEffect(() => {
    if (!autoResize) {
      return undefined;
    }
    const id = setInterval(
      () => setStep((s) => (s + 1) % sizes.length),
      1500
    );
    return () => clearInterval(id);
  }, [autoResize]);

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
    recording.dispose();
  });

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <SkiaRecordingView
          ref={ref}
          style={sizes[step]}
          highBitDepth={highBitDepth}
          onTarget={(t) => {
            // Runs on the JS thread; the worklet reads the shared value.
            setReported(t);
            setMismatches((m) => m + 1);
            if (lagRef.current) {
              setTimeout(() => {
                target.value = t;
              }, 600);
            } else {
              target.value = t;
            }
          }}
        />
      </View>
      <Text style={styles.label}>
        {reported
          ? `target ${reported.width}x${reported.height} px, highBitDepth ${reported.highBitDepth}`
          : "waiting for target"}
      </Text>
      <Text style={styles.label}>{`onTarget events: ${mismatches}`}</Text>
      <Button
        title={autoResize ? "Stop auto resize" : "Start auto resize"}
        onPress={() => setAutoResize((v) => !v)}
      />
      <Button
        title={lagTarget ? "Target lag: 600ms (drops frames)" : "Target lag: off"}
        onPress={() => setLagTarget((v) => !v)}
      />
      <Button
        title="Resize view"
        onPress={() => setStep((s) => (s + 1) % sizes.length)}
      />
      <Button
        title={`highBitDepth: ${highBitDepth ? "on" : "off"}`}
        onPress={() => setHighBitDepth((v) => !v)}
      />
      <Button
        title="Snapshot (logs size)"
        onPress={() => {
          const image = ref.current?.makeImageSnapshot();
          console.log(
            image ? `snapshot ${image.width()}x${image.height()}` : "no image"
          );
          image?.dispose();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14" },
  center: { alignItems: "center", padding: 16 },
  label: { color: "white", textAlign: "center", padding: 8 },
});
