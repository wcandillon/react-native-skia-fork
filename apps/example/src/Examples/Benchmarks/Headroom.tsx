import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";

import { median } from "./shared/api";
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
  UIMeter,
  ViewGrid,
  styles,
} from "./shared/ui";

// How much drawing can six views afford while everything stays smooth?
//
// For each mode the field grows step by step; at every step the UI-thread
// fps and the views' presented fps are sampled for a few seconds. The
// headroom of a mode is the largest field that keeps both above the
// threshold: the UI thread must not stutter and the views must still
// animate. A mode that only keeps the UI smooth by starving the views does
// not pass.

const N = 6;
const STEPS = [2000, 5000, 10000, 20000, 40000];
const THRESHOLD_FPS = 55;
const SETTLE_MS = 1500;
const SAMPLE_SECONDS = 3;

interface StepResult {
  mode: Mode;
  circles: number;
  uiFps: number;
  worstFrameMs: number;
  contentFps: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const BenchHeadroom = () => {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>("picture");
  const [circles, setCircles] = useState(STEPS[0]);
  const { stats: ui, frameTick } = useUIThreadMeter();
  const producer = useProducer(N, frameTick, mode, { kind: "field" });
  const content = useContentMeter(producer.ids);
  const [results, setResults] = useState<StepResult[]>([]);
  const [status, setStatus] = useState("idle");
  const [running, setRunning] = useState(false);
  const cellWidth = Math.floor((width - 16) / 2) - 8;
  const cellHeight = 120;
  const latest = useRef({ ui, content });
  latest.current = { ui, content };

  useEffect(() => {
    producer.mode.value = mode;
  }, [mode, producer.mode]);
  useEffect(() => {
    const radius = Math.hypot(cellWidth, cellHeight) / 2;
    producer.field.value = buildField(circles, radius);
  }, [cellWidth, circles, producer.field]);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults([]);
    const all: StepResult[] = [];
    for (const m of ["picture", "recording"] as const) {
      setMode(m);
      for (const c of STEPS) {
        setCircles(c);
        setStatus(`${m}: ${c} circles, settling`);
        await sleep(SETTLE_MS);
        const uiSamples: number[] = [];
        const worstSamples: number[] = [];
        const contentSamples: number[] = [];
        for (let s = 0; s < SAMPLE_SECONDS; s++) {
          setStatus(`${m}: ${c} circles, sampling ${s + 1}/${SAMPLE_SECONDS}`);
          await sleep(1000);
          uiSamples.push(latest.current.ui.fps);
          worstSamples.push(latest.current.ui.worst);
          contentSamples.push(latest.current.content.fps);
        }
        const result: StepResult = {
          mode: m,
          circles: c,
          uiFps: median(uiSamples),
          worstFrameMs: median(worstSamples),
          contentFps: median(contentSamples),
        };
        all.push(result);
        setResults([...all]);
        console.log(`[benchmark] ${JSON.stringify({ name: "headroom", ...result })}`);
      }
    }
    setStatus("done");
    setRunning(false);
  }, []);

  const params = useBenchParams();
  useEffect(() => {
    if (params.autoRun) {
      const timeout = setTimeout(runAll, 1500);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [params.autoRun, runAll]);

  const headroom = (m: Mode) => {
    const passing = results.filter(
      (r) =>
        r.mode === m &&
        r.uiFps >= THRESHOLD_FPS &&
        r.contentFps >= THRESHOLD_FPS
    );
    return passing.length > 0
      ? `${Math.max(...passing.map((r) => r.circles))} circles/view`
      : "none";
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.row}>
        <Button
          title={running ? "running" : "Run both modes"}
          onPress={runAll}
          disabled={running}
        />
        <Text style={styles.stat}>{status}</Text>
      </View>
      <UIMeter ui={ui} content={content} />
      <JankIndicator width={width} />
      <ViewGrid
        n={N}
        mode={mode}
        cellWidth={cellWidth}
        cellHeight={cellHeight}
        onId={producer.setId}
        onSize={producer.setSize}
        onTarget={producer.setTarget}
      />
      {results.length > 0 && (
        <View>
          <ResultRow label="mode, circles" values={["UI fps", "worst ms", "views fps"]} />
          {results.map((r) => (
            <ResultRow
              key={`${r.mode}-${r.circles}`}
              label={`${r.mode}, ${r.circles}`}
              values={[r.uiFps, r.worstFrameMs, r.contentFps]}
            />
          ))}
          <Text style={[styles.stat, { marginTop: 8 }]}>
            {`Headroom at ${THRESHOLD_FPS} fps (UI and views): picture ${headroom("picture")}, recording ${headroom("recording")}`}
          </Text>
        </View>
      )}
      <Note>
        Each step settles for 1.5 s, then samples 3 s. The threshold applies to
        both the UI thread and the views, so a mode cannot pass by leaving the
        views at a lower rate. On a 120 Hz display the UI threshold is
        lenient; read the worst-frame column too.
      </Note>
    </ScrollView>
  );
};
