#pragma once

#if defined(SK_GRAPHITE)

#include <memory>
#include <optional>

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdocumentation"

#include "include/core/SkImageInfo.h"
#include "include/gpu/graphite/Recording.h"
#include "include/gpu/graphite/TextureInfo.h"

#pragma clang diagnostic pop

namespace RNSkia {

/**
 * Description of a swapchain texture that a Graphite Recording can be
 * recorded against without the texture existing yet (the WebGPU analog is a
 * render bundle's attachment description). Both the view (from its window
 * context) and Skia.Context.makeDeferredCanvas (from JS) build their targets
 * through DawnContext::makeDeferredTarget so the two compare equal by
 * construction.
 *
 * Sizes are in pixels, never in points.
 */
struct RNSkDeferredTarget {
  SkImageInfo imageInfo;
  skgpu::graphite::TextureInfo textureInfo;
  // The bit depth that was actually selected (a request for high bit depth
  // falls back to 8-bit when the device does not support it).
  bool highBitDepth = false;

  int width() const { return imageInfo.width(); }
  int height() const { return imageInfo.height(); }

  bool operator==(const RNSkDeferredTarget &other) const {
    return imageInfo == other.imageInfo && textureInfo == other.textureInfo;
  }
  bool operator!=(const RNSkDeferredTarget &other) const {
    return !(*this == other);
  }
};

/**
 * A snapped Recording together with the target it was recorded for. `target`
 * is empty when no deferred canvas was created before snap(); such a
 * recording can be inserted without a target surface but cannot be presented
 * by a view.
 */
struct RNSkDeferredRecording {
  std::unique_ptr<skgpu::graphite::Recording> recording;
  std::optional<RNSkDeferredTarget> target;
};

} // namespace RNSkia

#endif // SK_GRAPHITE
