#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BackgroundRefreshStatus, NSObject)

RCT_EXTERN_METHOD(get:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
