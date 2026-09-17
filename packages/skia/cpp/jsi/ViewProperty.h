#pragma once

#include <functional>
#include <jsi/jsi.h>
#include <memory>
#include <string>
#include <variant>

#include "api/JsiSkPicture.h"

#if defined(SK_GRAPHITE)
#include "api/JsiSkRecording.h"
#endif

namespace RNJsi {
namespace jsi = facebook::jsi;

class ViewProperty {
public:
  ViewProperty(jsi::Runtime &runtime, const jsi::Value &value) {
    auto jsiPicture =
        RNSkia::tryGetJsiObject<RNSkia::JsiSkPicture>(runtime, value);
    if (jsiPicture) {
      _value = jsiPicture->getObject();
      return;
    }
#if defined(SK_GRAPHITE)
    auto jsiRecording =
        RNSkia::tryGetJsiObject<RNSkia::JsiSkRecording>(runtime, value);
    if (jsiRecording) {
      // Shared ownership: the view keeps the Recording alive even if JS
      // disposes or garbage-collects the handle before it was presented.
      _value = jsiRecording->getObject();
    }
#endif
  }

  bool isNull() { return std::holds_alternative<std::nullptr_t>(_value); }

  bool isPicture() { return std::holds_alternative<sk_sp<SkPicture>>(_value); }

  sk_sp<SkPicture> getPicture() { return std::get<sk_sp<SkPicture>>(_value); }

#if defined(SK_GRAPHITE)
  bool isRecording() {
    return std::holds_alternative<
        std::shared_ptr<RNSkia::RNSkDeferredRecording>>(_value);
  }

  std::shared_ptr<RNSkia::RNSkDeferredRecording> getRecording() {
    return std::get<std::shared_ptr<RNSkia::RNSkDeferredRecording>>(_value);
  }
#endif

private:
#if defined(SK_GRAPHITE)
  std::variant<std::nullptr_t, sk_sp<SkPicture>,
               std::shared_ptr<RNSkia::RNSkDeferredRecording>>
      _value = nullptr;
#else
  std::variant<std::nullptr_t, sk_sp<SkPicture>> _value = nullptr;
#endif
};
} // namespace RNJsi
