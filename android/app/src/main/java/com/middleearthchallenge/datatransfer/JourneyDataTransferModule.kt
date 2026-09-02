package com.middleearthchallenge.datatransfer

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class JourneyDataTransferModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private var exportContent: String? = null
  private var pendingPromise: Promise? = null

  private val activityEventListener: ActivityEventListener =
      object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?
        ) {
          when (requestCode) {
            EXPORT_REQUEST_CODE -> handleExportResult(resultCode, data)
            IMPORT_REQUEST_CODE -> handleImportResult(resultCode, data)
          }
        }
      }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = MODULE_NAME

  override fun invalidate() {
    reactContext.removeActivityEventListener(activityEventListener)
    super.invalidate()
  }

  @ReactMethod
  fun exportJson(fileName: String, content: String, promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("E_TRANSFER_BUSY", "Another data transfer is already in progress")
      return
    }
    val activity = getCurrentActivity()
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "Cannot open the file picker right now")
      return
    }

    exportContent = content
    pendingPromise = promise
    val intent =
        Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json")
            .putExtra(Intent.EXTRA_TITLE, fileName)
    reactContext.startActivityForResult(intent, EXPORT_REQUEST_CODE, null)
  }

  @ReactMethod
  fun importJson(promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("E_TRANSFER_BUSY", "Another data transfer is already in progress")
      return
    }
    val activity = getCurrentActivity()
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "Cannot open the file picker right now")
      return
    }

    pendingPromise = promise
    val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json")
    reactContext.startActivityForResult(intent, IMPORT_REQUEST_CODE, null)
  }

  private fun handleExportResult(resultCode: Int, data: Intent?) {
    val promise = pendingPromise ?: return
    val content = exportContent
    pendingPromise = null
    exportContent = null

    if (resultCode != Activity.RESULT_OK) {
      promise.resolve(null)
      return
    }

    val uri = data?.data
    if (uri == null || content == null) {
      promise.reject("E_EXPORT_FAILED", "No file was selected")
      return
    }

    try {
      reactContext.contentResolver.openOutputStream(uri, "wt")?.use { stream ->
        stream.write(content.toByteArray(Charsets.UTF_8))
      } ?: throw IllegalStateException("Could not open selected file")
      promise.resolve(displayName(uri))
    } catch (t: Throwable) {
      promise.reject("E_EXPORT_FAILED", t.message, t)
    }
  }

  private fun handleImportResult(resultCode: Int, data: Intent?) {
    val promise = pendingPromise ?: return
    pendingPromise = null

    if (resultCode != Activity.RESULT_OK) {
      promise.resolve(null)
      return
    }

    val uri: Uri? = data?.data
    if (uri == null) {
      promise.reject("E_IMPORT_FAILED", "No file was selected")
      return
    }

    try {
      val content =
          reactContext.contentResolver.openInputStream(uri)?.use { stream ->
            stream.bufferedReader(Charsets.UTF_8).use { reader -> reader.readText() }
          } ?: throw IllegalStateException("Could not open selected file")
      promise.resolve(content)
    } catch (t: Throwable) {
      promise.reject("E_IMPORT_FAILED", t.message, t)
    }
  }

  companion object {
    const val MODULE_NAME = "JourneyDataTransferModule"
    const val EXPORT_REQUEST_CODE = 8130
    const val IMPORT_REQUEST_CODE = 8131
  }

  private fun displayName(uri: Uri): String {
    reactContext.contentResolver
        .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor ->
          if (cursor.moveToFirst()) {
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0) {
              val name = cursor.getString(index)
              if (!name.isNullOrBlank()) return name
            }
          }
        }
    return uri.lastPathSegment ?: "backup file"
  }
}
