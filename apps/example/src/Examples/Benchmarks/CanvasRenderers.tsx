import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import {
  Canvas,
  Fill,
  Group,
  Picture,
  useCanvasRef,
} from "@shopify/react-native-skia";
import type { SkPicture } from "@shopify/react-native-skia";
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

import type { Mode } from "./shared/api";
import { useBenchParams } from "./shared/params";
import { useContentMeter, useUIThreadMeter } from "./shared/meters";
import { buildField } from "./shared/scenes";
import {
  Button,
  JankIndicator,
  Note,
  ResultRow,
  Segment,
  UIMeter,
  styles,
  useRun,
} from "./shared/ui";

// The declarative <Canvas> with its two renderers, same scene, same thread.
//
// A <Canvas> is drawn by the Reanimated UI runtime, which is the main thread,
// in both modes; nothing moves to another thread here. The renderer decides
// what the main thread does with the scene after drawing it:
// - picture: draw into an SkPicture, hand it to a SkiaPictureView, which
//   replays it into the swapchain and snaps.
// - recording: draw straight into a deferred canvas and snap; the view only
//   presents. The SkPicture round-trip is gone.
// The difference between the two is the cost of that round-trip.

const N = 6;
const COUNTS = [2000, 5000, 10000, 20000];

const Field = ({
  index,
  field,
  width,
  height,
  clock,
}: {
  index: number;
  field: SkPicture;
  width: number;
  height: number;
  clock: { value: number };
}) => {
  const transform = useDerivedValue(() => {
    const t = clock.value;
    const s = 0.85 + 0.15 * Math.sin(t * 0.002 + index);
    return [
      { translateX: width / 2 },
      { translateY: height / 2 },
      { rotate: (((t * 0.03 + index * 60) % 360) * Math.PI) / 180 },
      { scale: s },
    ];
  });
  return (
    <>
      <Fill color="#151a21" />
      <Group transform={transform}>
        <Picture picture={field} />
      </Group>
    </>
  );
};

export const BenchCanvasRenderers = () => {
  const { width } = useWindowDimensions();
  const params = useBenchParams();
  const [mode, setMode] = useState<Mode>(params.mode ?? "recording");
  const [countIndex, setCountIndex] = useState(2);
  const { stats: ui } = useUIThreadMeter();
  const cellWidth = Math.floor((width - 16) / 2) - 8;
  const cellHeight = 140;
  const field = useMemo(
    () => buildField(COUNTS[countIndex], Math.hypot(cellWidth, cellHeight) / 2),
    [cellWidth, countIndex]
  );
  const clock = useSharedValue(0);
  useFrameCallback((frame) => {
    "worklet";
    clock.value = frame.timestamp;
  });
  const refs = [
    useCanvasRef(),
    useCanvasRef(),
    useCanvasRef(),
    useCanvasRef(),
    useCanvasRef(),
    useCanvasRef(),
  ];
  const ids = useSharedValue<number[]>(new Array(N).fill(-1));
  const refsRef = useRef(refs);
  refsRef.current = refs;
  useEffect(() => {
    // Canvas ids are stable per mount; collect them once the views exist.
    const timeout = setTimeout(() => {
      ids.value = refsRef.current.map((r) => r.current?.getNativeId() ?? -1);
    }, 100);
    return () => clearTimeout(timeout);
  }, [ids, mode]);
  const content = useContentMeter(ids);

  const run = useRun("canvas-renderers", () => ({
    uiFps: ui.fps,
    worstFrameMs: ui.worst,
    longFrames: ui.long,
    contentFps: content.fps,
  }));
  const startRun = run.start;
  useEffect(() => {
    if (params.autoRun) {
      const timeout = setTimeout(
        () => startRun(`${mode}-${COUNTS[countIndex]}`),
        1500
      );
      return () => clearTimeout(timeout);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.autoRun, startRun]);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.row}>
        <Segment
          options={["picture", "recording"] as const}
          value={mode}
          onChange={setMode}
        />
        <Button
          title={`${COUNTS[countIndex]} circles/canvas`}
          onPress={() => setCountIndex((i) => (i + 1) % COUNTS.length)}
        />
        <Button
          title={run.running ? `running ${run.progress}s` : "Run 10 s"}
          onPress={() => run.start(`${mode}-${COUNTS[countIndex]}`)}
          disabled={run.running}
        />
      </View>
      <UIMeter ui={ui} content={content} />
      <JankIndicator width={width} />
      <View style={styles.grid}>
        {Array.from({ length: N }, (_, index) => (
          <Canvas
            key={`${mode}-${index}`}
            ref={refs[index]}
            renderer={mode}
            style={{
              width: cellWidth,
              height: cellHeight,
              margin: 4,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <Field
              index={index}
              field={field}
              width={cellWidth}
              height={cellHeight}
              clock={clock}
            />
          </Canvas>
        ))}
      </View>
      {run.result && (
        <View>
          <ResultRow label="" values={["UI fps", "worst", "long", "views fps"]} />
          <ResultRow
            label={`${mode}, ${COUNTS[countIndex]}`}
            values={[
              run.result.uiFps,
              run.result.worstFrameMs,
              run.result.longFrames,
              run.result.contentFps,
            ]}
          />
        </View>
      )}
      <Text style={styles.stat}>{`renderer="${mode}" on six <Canvas> elements`}</Text>
      <Note>
        Both renderers draw on the UI thread here, so this isolates the cost
        of the SkPicture round-trip that the recording renderer removes. Use
        "Multiple views" for the effect of a separate producer thread.
      </Note>
    </ScrollView>
  );
};
