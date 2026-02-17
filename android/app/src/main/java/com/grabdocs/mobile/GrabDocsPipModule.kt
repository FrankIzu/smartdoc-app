package com.grabdocs.mobile

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import android.util.Rational
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

/**
 * Native module to enter Picture-in-Picture when the app is backgrounded during a meeting.
 * Used as Phase 2 Option B when 100ms auto PiP does not activate in time.
 */
class GrabDocsPipModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GrabDocsPipModule"

  @ReactMethod
  fun enterPipForMeeting(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.resolve(false)
      return
    }
    val activity = currentActivity ?: run {
      Log.d(TAG, "enterPipForMeeting: no current activity")
      promise.resolve(false)
      return
    }
    if (!reactApplicationContext.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
      Log.d(TAG, "enterPipForMeeting: PiP not supported on device")
      promise.resolve(false)
      return
    }
    try {
      val params = PictureInPictureParams.Builder()
        .setAspectRatio(Rational(9, 16))
        .build()
      val entered = activity.enterPictureInPictureMode(params)
      Log.d(TAG, "enterPipForMeeting: enterPictureInPictureMode result=$entered")
      promise.resolve(entered)
    } catch (e: Exception) {
      Log.e(TAG, "enterPipForMeeting error", e)
      promise.reject("PIP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun isInPipMode(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.resolve(false)
      return
    }
    val activity = currentActivity ?: run {
      promise.resolve(false)
      return
    }
    promise.resolve(activity.isInPictureInPictureMode)
  }

  companion object {
    private const val TAG = "GrabDocsPiP"
  }
}
