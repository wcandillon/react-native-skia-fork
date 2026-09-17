import React, { useEffect, useRef, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { Canvas, Circle, Fill, Line, useCanvasRef } from "@shopify/react-native-skia";
import type { CanvasRef } from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { SkiaViewApi, round } from "./shared/api";
import type { Mode } from "./shared/api";
import { Note, colors, styles } from "./shared/ui";

// Touch-to-present, side by side. Drag on either canvas: both draw the
// finger position through their own renderer. Each gesture event stamps the
// time; the readout is the delay until the first frame presented after it,
// so the number is the latency of the whole chain from gesture to swapchain
// for that renderer. The recording view presents at the next vsync after a
// recording arrives, so expect it to trail by up to one frame.

const HEIGHT = 200;

const Pad = ({
  mode,
  pos,
  touchTs,
  canvasRef,
  width,
}: {
  mode: Mode;
  pos: SharedValue<{ x: number; y: number }>;
  touchTs: SharedValue<number>;
  canvasRef: React.RefObject<CanvasRef | null>;
  width: number;
}) => {
  const gesture = Gesture.Pan()
    .onBegin((e) => {
      pos.value = { x: e.x, y: e.y };
      touchTs.value = SkiaViewApi.now();
    })
    .onUpdate((e) => {
      pos.value = { x: e.x, y: e.y };
      touchTs.value = SkiaViewApi.now();
    });
  const cx = useDerivedValue(() => pos.value.x);
  const cy = useDerivedValue(() => pos.value.y);
  const h1 = useDerivedValue(() => ({ x: 0, y: pos.value.y }));
  const h2 = useDerivedValue(() => ({ x: width, y: pos.value.y }));
  const v1 = useDerivedValue(() => ({ x: pos.value.x, y: 0 }));
  const v2 = useDerivedValue(() => ({ x: pos.value.x, y: HEIGHT }));
  return (
    <GestureDetector gesture={gesture}>
      <Canvas
        ref={canvasRef}
        renderer={mode}
        style={{ width, height: HEIGHT, borderRadius: 8, overflow: "hidden" }}
      >
        <Fill color="#151a21" />
        <Line p1={h1} p2={h2} color="#2c3644" strokeWidth={1} />
        <Line p1={v1} p2={v2} color="#2c3644" strokeWidth={1} />
        <Circle cx={cx} cy={cy} r={28} color={mode === "picture" ? "#feca57" : "#48dbfb"} />
      </Canvas>
    </GestureDetector>
  );
};

export const BenchLatencyDemo = () => {
  const { width } = useWindowDimensions();
  const padWidth = width - 16;
  const pos = useSharedValue({ x: padWidth / 2, y: HEIGHT / 2 });
  const touchTs = useSharedValue(0);
  const pictureRef = useCanvasRef();
  const recordingRef = useCanvasRef();
  const [latency, setLatency] = useState<Record<Mode, number | null>>({
    picture: null,
    recording: null,
  });
  const history = useRef<Record<Mode, number[]>>({ picture: [], recording: [] });
  const lastTouch = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const ts = touchTs.value;
      if (ts === 0 || ts === lastTouch.current) {
        return;
      }
      const next: Record<Mode, number | null> = { ...latency };
      let complete = true;
      for (const [mode, ref] of [
        ["picture", pictureRef],
        ["recording", recordingRef],
      ] as const) {
        const id = ref.current?.getNativeId();
        if (id === undefined) {
          continue;
        }
        const { timestamps } = SkiaViewApi.getPresentStats(id);
        const first = timestamps.find((t) => t > ts);
        if (first === undefined) {
          complete = false;
          continue;
        }
        const value = first - ts;
        const h = history.current[mode];
        h.push(value);
        if (h.length > 30) {
          h.shift();
        }
        next[mode] = round(h.reduce((a, b) => a + b, 0) / h.length, 1);
      }
      if (complete) {
        lastTouch.current = ts;
      }
      setLatency(next);
    }, 50);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <Text style={[styles.stat, { color: "#feca57" }]}>
        {`picture renderer: ${latency.picture === null ? "drag to measure" : `${latency.picture} ms touch to present (avg of last 30)`}`}
      </Text>
      <Pad mode="picture" pos={pos} touchTs={touchTs} canvasRef={pictureRef} width={padWidth} />
      <View style={{ height: 12 }} />
      <Text style={[styles.stat, { color: "#48dbfb" }]}>
        {`recording renderer: ${latency.recording === null ? "drag to measure" : `${latency.recording} ms touch to present (avg of last 30)`}`}
      </Text>
      <Pad mode="recording" pos={pos} touchTs={touchTs} canvasRef={recordingRef} width={padWidth} />
      <Note>
        Drag on either pad; both follow the finger. The time is measured from
        the gesture event on the UI thread to the first frame the view
        presented afterwards, so it includes drawing, snapping and the vsync
        wait, but not the display's own scan-out. Compare the two numbers and
        how the discs keep up with the finger.
      </Note>
      <Text style={[styles.note, { color: colors.muted }]}>
        Software measurement only; a camera would add the display latency to
        both equally.
      </Text>
    </View>
  );
};
