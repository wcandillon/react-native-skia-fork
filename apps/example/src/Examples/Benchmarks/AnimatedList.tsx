import React, { useCallback, useEffect, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import type { LayoutChangeEvent, ViewToken } from "react-native";
import Animated, {
  scrollTo,
  useAnimatedRef,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

import type { Mode } from "./shared/api";
import { useBenchParams } from "./shared/params";
import { useContentMeter, useUIThreadMeter } from "./shared/meters";
import { useProducer } from "./shared/producer";
import {
  Button,
  JankIndicator,
  Note,
  ProducerCell,
  Segment,
  UIMeter,
  styles,
  useRun,
} from "./shared/ui";

// A list of live chart tiles, the everyday case: many small animated views
// on screen while the user scrolls. Scrolling, layout and mounting are
// main-thread work; picture views add a replay and a snap per tile per frame
// on top of it, recording views only present. The producer thread draws
// every visible tile each UI frame in both modes.

const ITEMS = 48;
const ITEM_HEIGHT = 96;
const BAR_COUNTS = [60, 240, 960];
const data = Array.from({ length: ITEMS }, (_, i) => i);

export const BenchAnimatedList = () => {
  const { width } = useWindowDimensions();
  const params = useBenchParams();
  const [mode, setMode] = useState<Mode>(params.mode ?? "recording");
  const [barsIndex, setBarsIndex] = useState(1);
  const [autoScroll, setAutoScroll] = useState(params.autoScroll ?? true);
  const { stats: ui, frameTick } = useUIThreadMeter();
  const producer = useProducer(ITEMS, frameTick, mode, {
    kind: "chart",
    count: BAR_COUNTS[barsIndex],
  });
  const content = useContentMeter(producer.ids, producer.disabled);
  const [batchMs, setBatchMs] = useState(0);
  const listRef = useAnimatedRef<Animated.FlatList<number>>();
  // Only tiles on screen are drawn: FlatList keeps a window of mounted
  // items around the viewport, and drawing those would be wasted work in
  // both modes.
  const [visibleCount, setVisibleCount] = useState(0);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<number>[] }) => {
      const visible = new Set(viewableItems.map((v) => v.item));
      setVisibleCount(visible.size);
      producer.setEnabled(data.map((index) => visible.has(index)));
    },
    [producer]
  );
  const viewport = useSharedValue(0);
  const scrolling = useSharedValue(autoScroll);

  useEffect(() => {
    producer.mode.value = mode;
  }, [mode, producer.mode]);
  useEffect(() => {
    producer.scene.value = { kind: "chart", count: BAR_COUNTS[barsIndex] };
  }, [barsIndex, producer.scene]);
  useEffect(() => {
    scrolling.value = autoScroll;
  }, [autoScroll, scrolling]);
  useEffect(() => {
    const interval = setInterval(
      () => setBatchMs(producer.batchMs.value),
      500
    );
    return () => clearInterval(interval);
  }, [producer.batchMs]);

  // Scroll up and down continuously from the UI thread (as a finger would).
  useFrameCallback((frame) => {
    "worklet";
    if (!scrolling.value || viewport.value === 0) {
      return;
    }
    const range = ITEMS * ITEM_HEIGHT - viewport.value;
    // A full pass down and up in 16 s, about the pace of a finger.
    const period = 16000;
    const phase = (frame.timestamp % period) / period;
    const y = range * (phase < 0.5 ? phase * 2 : 2 - phase * 2);
    scrollTo(listRef, 0, y, false);
  });

  const run = useRun("animated-list", () => ({
    uiFps: ui.fps,
    worstFrameMs: ui.worst,
    longFrames: ui.long,
    contentFps: content.fps,
    activeViews: content.active,
    batchMs,
  }));
  const startRun = run.start;
  useEffect(() => {
    if (params.autoRun) {
      const timeout = setTimeout(
        () => startRun(`${mode}-${BAR_COUNTS[barsIndex]}`),
        1500
      );
      return () => clearTimeout(timeout);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.autoRun, startRun]);

  const renderItem = useCallback(
    ({ item }: { item: number }) => (
      <View style={{ height: ITEM_HEIGHT, padding: 4 }}>
        <ProducerCell
          key={`${mode}-${item}`}
          index={item}
          mode={mode}
          onId={producer.setId}
          onSize={producer.setSize}
          onTarget={producer.setTarget}
          style={{ flex: 1 }}
        />
      </View>
    ),
    [mode, producer.setId, producer.setSize, producer.setTarget]
  );

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Segment
          options={["picture", "recording"] as const}
          value={mode}
          onChange={setMode}
        />
        <Button
          title={`${BAR_COUNTS[barsIndex]} bars/tile`}
          onPress={() => setBarsIndex((i) => (i + 1) % BAR_COUNTS.length)}
        />
        <Button
          title={autoScroll ? "auto-scroll: on" : "auto-scroll: off"}
          onPress={() => setAutoScroll((v) => !v)}
        />
        <Button
          title={run.running ? `running ${run.progress}s` : "Run 10 s"}
          onPress={() => run.start(`${mode}-${BAR_COUNTS[barsIndex]}`)}
          disabled={run.running}
        />
      </View>
      <UIMeter ui={ui} content={content} batchMs={batchMs} />
      <Text style={styles.stat}>{`${visibleCount} tiles on screen`}</Text>
      <JankIndicator width={width} />
      {run.result && (
        <Text style={styles.stat}>
          {`median: UI ${run.result.uiFps} fps, worst ${run.result.worstFrameMs} ms, ${run.result.longFrames} long, tiles ${run.result.contentFps} fps (${run.result.activeViews} visible)`}
        </Text>
      )}
      <Animated.FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => `${mode}-${item}`}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        onLayout={(e: LayoutChangeEvent) => {
          viewport.value = e.nativeEvent.layout.height;
        }}
        style={{ flex: 1 }}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 1 }}
      />
      <Note>
        48 tiles; the producer thread draws the visible ones every UI frame.
        Switch the mode while scrolling and watch the spinner and the
        worst-frame number.
      </Note>
    </View>
  );
};
