import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";

import type { Mode } from "./shared/api";
import { useBenchParams } from "./shared/params";
import { pacingOf, useContentMeter, useUIThreadMeter } from "./shared/meters";
import type { PacingStats } from "./shared/meters";
import { useProducer } from "./shared/producer";
import { buildField } from "./shared/scenes";
import {
  Button,
  Note,
  ResultRow,
  UIMeter,
  ViewGrid,
  colors,
  styles,
} from "./shared/ui";

// Frame pacing: the intervals between consecutive presents of one view,
// from the timestamps the native view records when it hands a frame to the
// swapchain. Both views present from the vsync driver, so under no load the
// intervals should cluster at the display period; under load the picture
// view's main-thread work pushes presents late and spreads them out.

const N = 6;
const CIRCLES = 10000;
const SETTLE_MS = 2000;
const CAPTURE_MS = 4000;
const BINS = ["<8", "8-12", "12-20", "20-33", ">33"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const Histogram = ({ stats, width }: { stats: PacingStats; width: number }) => {
  const max = Math.max(1, ...stats.histogram);
  return (
    <View style={{ marginVertical: 4 }}>
      {stats.histogram.map((count, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[styles.stat, { width: 48 }]}>{BINS[i]}</Text>
          <View
            style={{
              height: 10,
              width: Math.max(2, ((width - 120) * count) / max),
              backgroundColor: colors.accent,
              borderRadius: 3,
            }}
          />
          <Text style={[styles.stat, { marginLeft: 6 }]}>{count}</Text>
        </View>
      ))}
    </View>
  );
};

export const BenchPacing = () => {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>("picture");
  const { stats: ui, frameTick } = useUIThreadMeter();
  const producer = useProducer(N, frameTick, mode, { kind: "field" });
  const content = useContentMeter(producer.ids);
  const [results, setResults] = useState<Partial<Record<Mode, PacingStats>>>({});
  const [status, setStatus] = useState("idle");
  const [running, setRunning] = useState(false);
  const cellWidth = Math.floor((width - 16) / 2) - 8;
  const cellHeight = 120;

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
    setResults({});
    const all: Partial<Record<Mode, PacingStats>> = {};
    for (const m of ["picture", "recording"] as const) {
      setMode(m);
      setStatus(`${m}: settling`);
      await sleep(SETTLE_MS);
      setStatus(`${m}: capturing`);
      await sleep(CAPTURE_MS);
      const id = producer.ids.value[0];
      const stats = pacingOf(id);
      all[m] = stats;
      setResults({ ...all });
      console.log(`[benchmark] ${JSON.stringify({ name: "pacing", mode: m, ...stats })}`);
    }
    setStatus("done");
    setRunning(false);
  }, [producer.ids]);

  const params = useBenchParams();
  useEffect(() => {
    if (params.autoRun) {
      const timeout = setTimeout(runAll, 1500);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [params.autoRun, runAll]);

  const modes = Object.keys(results) as Mode[];
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
      {modes.length > 0 && (
        <View>
          <ResultRow
            label="mode"
            values={["presents", "mean ms", "p95 ms", "max ms", "stddev"]}
          />
          {modes.map((m) => {
            const r = results[m]!;
            return (
              <ResultRow
                key={m}
                label={m}
                values={[r.samples, r.meanMs, r.p95Ms, r.maxMs, r.stddevMs]}
              />
            );
          })}
          {modes.map((m) => (
            <View key={`h-${m}`}>
              <Text style={[styles.stat, { marginTop: 8 }]}>{`${m}: interval histogram (ms)`}</Text>
              <Histogram stats={results[m]!} width={width} />
            </View>
          ))}
        </View>
      )}
      <Note>
        {`Intervals between the last presents of the first view (up to 240), six views at ${CIRCLES} circles. A tight cluster at the display period means steady pacing; a long tail means presents slipping behind the main thread.`}
      </Note>
    </ScrollView>
  );
};
