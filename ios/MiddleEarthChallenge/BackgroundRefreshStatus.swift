import Foundation
import UIKit
import React

/// Exposes `UIApplication.backgroundRefreshStatus` to JS so we can warn the
/// user when iOS won't wake the app for background HealthKit deliveries.
///
/// Status values mirror Apple's enum:
///   - "available"  → Background App Refresh is on for this app
///   - "denied"     → User disabled it (globally or just for us)
///   - "restricted" → Parental controls / MDM blocks it
@objc(BackgroundRefreshStatus)
class BackgroundRefreshStatus: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool {
    // backgroundRefreshStatus must be read on the main thread.
    return true
  }

  @objc
  func get(_ resolve: @escaping RCTPromiseResolveBlock,
           rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let status = UIApplication.shared.backgroundRefreshStatus
      switch status {
      case .available:
        resolve("available")
      case .denied:
        resolve("denied")
      case .restricted:
        resolve("restricted")
      @unknown default:
        resolve("available")
      }
    }
  }
}
