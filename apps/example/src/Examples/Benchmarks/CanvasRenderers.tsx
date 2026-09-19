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

// The declarative <Canvas> with its two renderers, same scene.
//
// - picture: the Reanimated UI runtime (the main thread) draws the scene
//   into an SkPicture and a SkiaPictureView replays it into the swapchain
//   and snaps, on the main thread.
// - recording: the scene is recorded on the library's producer thread (a
//   worklet runtime, see sksg/WorkerProducer.ts) and a SkiaRecordingView only
//   presents. The UI runtime just flags changed inputs.
// Same scene graph, same animated values; only the thread that pays for the
// drawing differs.

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
        Picture: the UI thread draws and the views replay on the main thread.
        Recording: the library's producer thread draws, the main thread only
        presents. The scene graph and animated values are identical.
      </Note>
    </ScrollView>
  );
};
