package nz.corefocus.firewall.vault

import android.content.Context
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream

/**
 * Turns whatever the photo picker hands back into the flat, anonymous pixels
 * the vault stores.
 *
 * Three things happen here, in this order, and each matters:
 *
 *  1. Downsample. A 108MP Samsung frame decoded at full size is a 400MB
 *     allocation and an instant OOM, so the decode is sampled down on the way
 *     in and never holds more than [MAX_EDGE] on the long edge.
 *  2. Rotate. EXIF orientation is applied to the pixels now, because the
 *     output has no EXIF for a viewer to read later.
 *  3. Re-encode. Fresh JPEG bytes, which is what drops the metadata: GPS,
 *     capture time, device serial, lens, and the camera's own embedded
 *     preview thumbnail (which otherwise survives edits and crops).
 */
object ImageNormaliser {

    /** Long-edge cap. Generous enough that a full-screen view still looks native. */
    const val MAX_EDGE = 3072

    const val THUMBNAIL_EDGE = 384
    const val IMAGE_QUALITY = 92
    const val THUMBNAIL_QUALITY = 80

    data class Normalised(
        val meta: VaultFormat.Meta,
        val imageJpeg: ByteArray,
        val thumbnailJpeg: ByteArray,
    )

    fun normalise(context: Context, source: Uri): Normalised? {
        val resolver = context.contentResolver

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        try {
            resolver.openInputStream(source)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        } catch (e: Exception) {
            Log.w(TAG, "could not measure source image", e)
            return null
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        val decodeOptions = BitmapFactory.Options().apply {
            inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight, MAX_EDGE)
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = try {
            resolver.openInputStream(source)?.use { BitmapFactory.decodeStream(it, null, decodeOptions) }
        } catch (e: OutOfMemoryError) {
            Log.w(TAG, "out of memory decoding source image")
            null
        } catch (e: Exception) {
            Log.w(TAG, "could not decode source image", e)
            null
        } ?: return null

        val rotation = readOrientation(context, source)
        val upright = applyRotation(decoded, rotation)
        val scaled = scaleToFit(upright, MAX_EDGE)
        val thumbnail = scaleToFit(scaled, THUMBNAIL_EDGE)

        val imageJpeg = scaled.toJpeg(IMAGE_QUALITY)
        val thumbnailJpeg = thumbnail.toJpeg(THUMBNAIL_QUALITY)

        val meta = VaultFormat.Meta(
            displayName = displayNameOf(context, source) ?: "Photo",
            width = scaled.width,
            height = scaled.height,
            sourceBytes = sizeOf(context, source),
            // Deliberately now, not the EXIF capture date. The capture date is
            // part of what the owner is hiding, and it is about to be stripped.
            capturedAtEpochMillis = System.currentTimeMillis(),
        )

        if (thumbnail !== scaled) thumbnail.recycle()
        if (scaled !== upright) scaled.recycle()
        if (upright !== decoded) upright.recycle()
        decoded.recycle()

        return Normalised(meta, imageJpeg, thumbnailJpeg)
    }

    /** Largest power-of-two sample size that still leaves the long edge at or above [maxEdge]. */
    internal fun sampleSizeFor(width: Int, height: Int, maxEdge: Int): Int {
        var sample = 1
        var longEdge = maxOf(width, height)
        while (longEdge / 2 >= maxEdge) {
            longEdge /= 2
            sample *= 2
        }
        return sample
    }

    private fun readOrientation(context: Context, source: Uri): Int =
        try {
            context.contentResolver.openInputStream(source)?.use { stream ->
                when (ExifInterface(stream).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL,
                )) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            } ?: 0
        } catch (e: Exception) {
            0
        }

    private fun applyRotation(bitmap: Bitmap, degrees: Int): Bitmap {
        if (degrees == 0) return bitmap
        val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun scaleToFit(bitmap: Bitmap, maxEdge: Int): Bitmap {
        val longEdge = maxOf(bitmap.width, bitmap.height)
        if (longEdge <= maxEdge) return bitmap
        val ratio = maxEdge.toFloat() / longEdge
        return Bitmap.createScaledBitmap(
            bitmap,
            maxOf(1, (bitmap.width * ratio).toInt()),
            maxOf(1, (bitmap.height * ratio).toInt()),
            true,
        )
    }

    private fun Bitmap.toJpeg(quality: Int): ByteArray =
        ByteArrayOutputStream().also { compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()

    private fun displayNameOf(context: Context, uri: Uri): String? =
        queryColumn(context, uri, OpenableColumns.DISPLAY_NAME) { it.getString(0) }

    private fun sizeOf(context: Context, uri: Uri): Long =
        queryColumn(context, uri, OpenableColumns.SIZE) { it.getLong(0) } ?: 0L

    private fun <T> queryColumn(context: Context, uri: Uri, column: String, read: (Cursor) -> T): T? =
        try {
            context.contentResolver.query(uri, arrayOf(column), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst() && !cursor.isNull(0)) read(cursor) else null
            }
        } catch (e: Exception) {
            null
        }

    private const val TAG = "Vault"
}
