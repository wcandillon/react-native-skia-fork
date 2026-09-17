import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";

import { SkiaViewApi, median, round } from "./shared/api";
import type { Mode } from "./shared/api";
import { useBenchParams } from "./shared/params";
import { useContentMeter, useUIThreadMeter } from "./shared/meters";
import { useProducer } from "./shared/producer";
import { buildField } from "./shared/scenes";
import {
  Button,
  Note,
  ResultRow,
  UIMeter,
  ViewGrid,
  styles,
} from "./shared/ui";

// Total CPU and memory of the process, per mode, same scene. Recordings
// should not add work, only move it between threads: CPU time (all threads)
// and resident memory over a 10 s run say whether that holds.

const N = 6;
const CIRCLES = 10000;
const RUN_SECONDS = 10;
const SETTLE_MS = 2000;

interface ResourceResult {
  mode: Mode;
  cpuPercent: number;
  peakMemoryMb: number;
  memoryDeltaMb: number;
  uiFps: number;
  contentFps: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const BenchResources = () => {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>("picture");
  const { stats: ui, frameTick } = useUIThreadMeter();
  const producer = useProducer(N, frameTick, mode, { kind: "field" });
  const content = useContentMeter(producer.ids);
  const [results, setResults] = useState<ResourceResult[]>([]);
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
    producer.field.value = buildField(
      CIRCLES,
      Math.hypot(cellWidth, cellHeight) / 2
    );
  }, [cellWidth, producer.field]);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults([]);
    const all: ResourceResult[] = [];
    for (const m of ["picture", "recording"] as const) {
      setMode(m);
      setStatus(`${m}: settling`);
      await sleep(SETTLE_MS);
      const start = SkiaViewApi.getProcessStats();
      let peak = start.residentMemoryBytes;
      const uiSamples: number[] = [];
      const contentSamples: number[] = [];
      for (let s = 0; s < RUN_SECONDS; s++) {
        setStatus(`${m}: ${s + 1}/${RUN_SECONDS} s`);
        await sleep(1000);
        peak = Math.max(peak, SkiaViewApi.getProcessStats().residentMemoryBytes);
        uiSamples.push(latest.current.ui.fps);
        contentSamples.push(latest.current.content.fps);
      }
      const end = SkiaViewApi.getProcessStats();
      const wallMs = end.now - start.now;
      const result: ResourceResult = {
        mode: m,
        cpuPercent: round(((end.cpuTimeMs - start.cpuTimeMs) / wallMs) * 100, 0),
        peakMemoryMb: round(peak / (1024 * 1024), 0),
        memoryDeltaMb: round(
          (end.residentMemoryBytes - start.residentMemoryBytes) / (1024 * 1024),
          0
        ),
        uiFps: median(uiSamples),
        contentFps: median(contentSamples),
      };
      all.push(result);
      setResults([...all]);
      console.log(`[benchmark] ${JSON.stringify({ name: "resources", ...result })}`);
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
          <ResultRow
            label="mode"
            values={["CPU %", "peak MB", "delta MB", "UI fps", "views fps"]}
          />
          {results.map((r) => (
            <ResultRow
              key={r.mode}
              label={r.mode}
              values={[
                r.cpuPercent,
                r.peakMemoryMb,
                r.memoryDeltaMb,
                r.uiFps,
                r.contentFps,
              ]}
            />
          ))}
        </View>
      )}
      <Note>
        {`Six views, ${CIRCLES} circles each, ${RUN_SECONDS} s per mode after a ${SETTLE_MS / 1000} s settle. CPU % is process CPU time over wall time, all threads, so 100 % is one core. Compare it together with the frames actually presented: work per presented frame is what matters.`}
      </Note>
    </ScrollView>
  );
};
