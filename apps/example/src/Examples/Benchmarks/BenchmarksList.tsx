import React from "react";
import { ScrollView, Text } from "react-native";

import { HomeScreenButton } from "../../Home/HomeScreenButton";

import { Note, styles } from "./shared/ui";

export const Benchmarks = () => (
  <ScrollView style={styles.container}>
    <Text style={[styles.stat, { padding: 8 }]}>
      {'Recording views vs picture views on Graphite. Results are shown on screen and logged as "[benchmark] {...}" JSON lines.'}
    </Text>
    <HomeScreenButton
      title="🧵 Multiple views"
      description="Six views fed from a producer thread: what the main thread has left"
      route="BenchMultipleViews"
    />
    <HomeScreenButton
      title="📈 Headroom"
      description="Largest scene that keeps both the UI and the views smooth"
      route="BenchHeadroom"
    />
    <HomeScreenButton
      title="📋 Animated list"
      description="48 live chart tiles in a scrolling list"
      route="BenchAnimatedList"
    />
    <HomeScreenButton
      title="🖼 Canvas renderers"
      description='<Canvas renderer="picture" | "recording">: the SkPicture round-trip'
      route="BenchCanvasRenderers"
    />
    <HomeScreenButton
      title="👆 Input latency (demo)"
      description="Drag on both renderers, touch-to-present readout"
      route="BenchLatency"
    />
    <HomeScreenButton
      title="🔋 CPU and memory"
      description="Process CPU time and resident memory per mode"
      route="BenchResources"
    />
    <HomeScreenButton
      title="⏱ Frame pacing"
      description="Present interval statistics per mode"
      route="BenchPacing"
    />
    <Note>
      Run on a device: the simulator's host CPU hides most of the difference.
      Every screen measures the UI thread from a Reanimated frame callback and
      the views from their native presentation counters.
    </Note>
  </ScrollView>
);
