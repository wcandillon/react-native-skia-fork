#pragma once

#import <functional>
#import <memory>
#import <mutex>

#import "RNSkFrameScheduler.h"

#if !TARGET_OS_OSX
#import <QuartzCore/CADisplayLink.h>
#else
#import <CoreVideo/CVDisplayLink.h>
#endif

/**
 * Vsync driver backed by CADisplayLink (iOS/tvOS/visionOS) or CVDisplayLink
 * (macOS). The link is created on the main thread on first use, kept paused
 * while nothing is pending and paused again after every callback.
 */
class RNSkAppleFrameScheduler
    : public RNSkia::RNSkFrameScheduler,
      public std::enable_shared_from_this<RNSkAppleFrameScheduler> {
public:
  explicit RNSkAppleFrameScheduler(std::function<void()> onFrame);
  ~RNSkAppleFrameScheduler() override;

  void requestFrame() override;

  // Called by the platform link on the main thread.
  void onVsync();

private:
  void armOnMainThread();

  std::function<void()> _onFrame;
  std::mutex _mutex;
  bool _armed = false;
#if !TARGET_OS_OSX
  CADisplayLink *_displayLink = nullptr;
  id _target = nullptr;
#else
  CVDisplayLinkRef _displayLink = nullptr;
#endif
};
