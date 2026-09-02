package com.middleearthchallenge.pedometer

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.middleearthchallenge.datatransfer.JourneyDataTransferModule

/**
 * React Native package that exposes the pedometer native module to JS.
 * Registered in `MainApplication.kt` alongside the auto-linked packages.
 */
class PedometerPackage : ReactPackage {

  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(PedometerModule(reactContext), JourneyDataTransferModule(reactContext))
  }

  @Suppress("DEPRECATION")
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
