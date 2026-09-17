#import "SkiaRecordingView.h"

#import "RNSkAppleView.h"
#import "RNSkPlatformContext.h"
#import "RNSkRecordingView.h"

#import "RNSkiaModule.h"
#import "SkiaManager.h"
#import "SkiaUIView.h"

#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <React/RCTLog.h>

#import <react/renderer/components/rnskia/ComponentDescriptors.h>
#import <react/renderer/components/rnskia/EventEmitters.h>
#import <react/renderer/components/rnskia/Props.h>
#import <react/renderer/components/rnskia/RCTComponentViewHelpers.h>

using namespace facebook::react;

#if defined(SK_GRAPHITE)
@interface SkiaRecordingView ()
- (void)emitTarget:(const RNSkia::RNSkDeferredTarget &)target;
@end
#endif

@implementation SkiaRecordingView {
#if defined(SK_GRAPHITE)
  // The target reported by the native view before the event emitter was
  // attached, delivered by updateEventEmitter.
  std::optional<RNSkia::RNSkDeferredTarget> _pendingTarget;
#endif
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
#if defined(SK_GRAPHITE)
    // Pass SkManager as a raw pointer to avoid circular dependencies
    auto skManager = [SkiaManager latestActiveSkManager].get();
    __weak SkiaRecordingView *weakSelf = self;
    [self initCommon:skManager
             factory:[weakSelf](
                         std::shared_ptr<RNSkia::RNSkPlatformContext> context) {
               auto view =
                   std::make_shared<RNSkAppleView<RNSkia::RNSkRecordingView>>(
                       context);
               view->setOnTargetChanged(
                   [weakSelf](const RNSkia::RNSkDeferredTarget &target) {
                     [weakSelf emitTarget:target];
                   });
               return view;
             }];
#else
    RCTLogError(@"%s", RNSkia::RNSkRecordingView::kUnavailableMessage);
#endif
    static const auto defaultProps =
        std::make_shared<const SkiaRecordingViewProps>();
    _props = defaultProps;
  }
  return self;
}

#if defined(SK_GRAPHITE)
- (void)emitTarget:(const RNSkia::RNSkDeferredTarget &)target {
  // Fired from the main thread (layout, high bit depth change) or from the
  // present path on a target mismatch; the Fabric emitter is thread-safe.
  if (!_eventEmitter) {
    _pendingTarget = target;
    return;
  }
  std::static_pointer_cast<const SkiaRecordingViewEventEmitter>(_eventEmitter)
      ->onTarget({.width = target.width(),
                  .height = target.height(),
                  .highBitDepth = target.highBitDepth});
}

- (void)updateEventEmitter:(const EventEmitter::Shared &)eventEmitter {
  [super updateEventEmitter:eventEmitter];
  if (_pendingTarget) {
    auto target = *_pendingTarget;
    _pendingTarget.reset();
    [self emitTarget:target];
  }
}
#endif

#pragma mark - RCTComponentViewProtocol

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<
      SkiaRecordingViewComponentDescriptor>();
}

- (void)updateProps:(const Props::Shared &)props
           oldProps:(const Props::Shared &)oldProps {
  const auto &newProps =
      *std::static_pointer_cast<const SkiaRecordingViewProps>(props);
  [super updateProps:props oldProps:oldProps];
  int nativeId =
      [[RCTConvert NSString:RCTNSStringFromString(newProps.nativeId)] intValue];
  [self setNativeId:nativeId];
  [self setDebugMode:newProps.debug];
  [self setOpaque:newProps.opaque];
  [self setHighBitDepth:newProps.highBitDepth];
}

@end

Class<RCTComponentViewProtocol> SkiaRecordingViewCls(void) {
  return SkiaRecordingView.class;
}
