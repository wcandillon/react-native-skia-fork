import React, { useEffect, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";

import type { Mode } from "./shared/api";
import { useBenchParams } from "./shared/params";
import { useContentMeter, useUIThreadMeter } from "./shared/meters";
import { useProducer } from "./shared/producer";
import { buildField } from "./shared/scenes";
import {
  Button,
  JankIndicator,
  Note,
  ResultRow,
  Segment,
  UIMeter,
  ViewGrid,
  styles,
  useRun,
} from "./shared/ui";

// Six views, one producer thread, two ways to get pixels on screen.
//
// Every view shows the same particle field: a picture with thousands of
// circles, recorded once, drawn rotating by a dedicated worklet runtime (a
// real background thread). Producing a frame is one drawPicture call; what
// costs is Skia turning those circles into GPU work, and the mode decides
// which thread pays for it:
// - Picture: the producer records a tiny SkPicture that references the field.
//   Each SkiaPictureView then replays it into its swapchain and snaps a
//   Recording on the main thread, every frame.
// - Recording: the producer draws into a deferred canvas and snaps. The main
//   thread only binds the swapchain texture, submits and presents.

const N = 6;
const COUNTS = [2000, 5000, 10000, 20000];

export const BenchMultipleViews = () => {
  const { width } = useWindowDimensions();
  const params = useBenchParams();
  const [mode, setMode] = useState<Mode>(params.mode ?? "recording");
  const [countIndex, setCountIndex] = useState(2);
  const [highPriority, setHighPriority] = useState(true);
  const { stats: ui, frameTick } = useUIThreadMeter();
  const producer = useProducer(
    N,
    frameTick,
    mode,
    { kind: "field" },
    highPriority
  );
  const content = useContentMeter(producer.ids);
  const [batchMs, setBatchMs] = useState(0);
  const cellWidth = Math.floor((width - 16) / 2) - 8;
  const cellHeight = 140;

  useEffect(() => {
    producer.mode.value = mode;
  }, [mode, producer.mode]);
  useEffect(() => {
    const radius = Math.hypot(cellWidth, cellHeight) / 2;
    // The previous field is left to the garbage collector: the producer
    // thread may still be drawing it.
    producer.field.value = buildField(COUNTS[countIndex], radius);
  }, [cellWidth, countIndex, producer.field]);
  useEffect(() => {
    const interval = setInterval(
      () => setBatchMs(producer.batchMs.value),
      500
    );
    return () => clearInterval(interval);
  }, [producer.batchMs]);

  const run = useRun("multiple-views", () => ({
    uiFps: ui.fps,
    worstFrameMs: ui.worst,
    longFrames: ui.long,
    contentFps: content.fps,
    batchMs,
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
          title={`${COUNTS[countIndex]} circles/view`}
          onPress={() => setCountIndex((i) => (i + 1) % COUNTS.length)}
        />
        <Button
          title={`producer priority: ${highPriority ? "high" : "normal"}`}
          onPress={() => setHighPriority((v) => !v)}
        />
      </View>
      <UIMeter ui={ui} content={content} batchMs={batchMs} />
      <JankIndicator width={width} />
      <View style={styles.row}>
        <Button
          title={run.running ? `running ${run.progress}s` : "Run 10 s"}
          onPress={() => run.start(`${mode}-${COUNTS[countIndex]}`)}
          disabled={run.running}
        />
        {run.result && (
          <Text style={styles.stat}>
            {`median: UI ${run.result.uiFps} fps, worst ${run.result.worstFrameMs} ms, ${run.result.longFrames} long, views ${run.result.contentFps} fps, batch ${run.result.batchMs} ms`}
          </Text>
        )}
      </View>
      <ViewGrid
        n={N}
        mode={mode}
        cellWidth={cellWidth}
        cellHeight={cellHeight}
        onId={producer.setId}
        onSize={producer.setSize}
        onTarget={producer.setTarget}
      />
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
      <Note>
        Same scene, same producer thread. Picture: the main thread replays the
        circles of six pictures and snaps six recordings per frame. Recording:
        the producer thread does that work and the main thread only presents.
        "Views fps" is how often the views actually change; the producer cannot
        exceed one batch per UI frame.
      </Note>
    </ScrollView>
  );
};
