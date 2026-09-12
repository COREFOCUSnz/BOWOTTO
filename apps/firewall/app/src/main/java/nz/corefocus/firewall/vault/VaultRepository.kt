package nz.corefocus.firewall.vault

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.UUID
import javax.crypto.SecretKey

/**
 * The gallery behind the lock.
 *
 * Everything lives in `filesDir/vault`, which is private app storage: no other
 * app can read it, the media scanner never indexes it, and nothing in it shows
 * up in Samsung Gallery, Files, or a USB browse of the phone. A .fwl there is
 * also unreadable to us without the vault key, so a rooted device or an adb
 * backup yields only noise.
 */
class VaultRepository(context: Context, private val key: SecretKey) {

    private val appContext = context.applicationContext
    private val directory = File(appContext.filesDir, DIRECTORY).apply { mkdirs() }

    /** One row in the grid. The image itself stays on disk until asked for. */
    data class Entry(
        val id: String,
        val displayName: String,
        val width: Int,
        val height: Int,
        val addedAtEpochMillis: Long,
        val sizeOnDisk: Long,
    )

    /**
     * Lists the vault, newest first. A file that fails to parse or decrypt is
     * skipped rather than thrown: one bad file must not make the whole gallery
     * unopenable, and the owner can still delete it from the grid.
     */
    fun list(): List<Entry> =
        (directory.listFiles { f -> f.isFile && f.extension == VaultFormat.EXTENSION } ?: emptyArray())
            .mapNotNull { file ->
                try {
                    RandomAccessFile(file, "r").use { raf ->
                        val header = VaultFormat.readHeader(raf)
                        val meta = VaultFormat.readMeta(raf, key, header)
                        Entry(
                            id = file.name,
                            displayName = meta.displayName,
                            width = meta.width,
                            height = meta.height,
                            addedAtEpochMillis = header.createdAtEpochMillis,
                            sizeOnDisk = file.length(),
                        )
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "skipping unreadable vault file")
                    null
                }
            }
            .sortedByDescending { it.addedAtEpochMillis }

    fun thumbnail(id: String): Bitmap? = read(id) { raf, header ->
        VaultFormat.readThumbnail(raf, key, header).toBitmap()
    }

    fun image(id: String): Bitmap? = read(id) { raf, header ->
        VaultFormat.readImage(raf, key, header).toBitmap()
    }

    /**
     * Imports one picture. Returns the new entry id, or null if the source
     * could not be read or decoded.
     *
     * The bytes that land in the vault are a re-encode, not a copy: the source
     * is decoded to pixels and written back out as a fresh JPEG. That is what
     * the app is doing when it "takes a screenshot" of the photo - and the
     * side effect is the point, because every EXIF block goes with it. No GPS
     * coordinates, no camera serial, no original timestamp, no thumbnail
     * embedded by the camera that could survive a crop.
     */
    fun import(source: Uri): String? {
        val decoded = ImageNormaliser.normalise(appContext, source) ?: return null

        val id = "${UUID.randomUUID()}.${VaultFormat.EXTENSION}"
        val target = File(directory, id)
        val staging = File(directory, "$id$TEMP_SUFFIX")

        return try {
            // Write to a staging name and rename on success, so a crash or a
            // full disk mid-write can never leave a half file in the grid.
            staging.outputStream().use { out ->
                VaultFormat.write(
                    out = out,
                    key = key,
                    meta = decoded.meta,
                    thumbnail = decoded.thumbnailJpeg,
                    image = decoded.imageJpeg,
                )
            }
            if (!staging.renameTo(target)) throw IOException("could not commit $id")
            id
        } catch (e: Exception) {
            Log.w(TAG, "import failed", e)
            staging.delete()
            target.delete()
            null
        }
    }

    /**
     * Removes a file from the vault. Overwrites it with random bytes first:
     * on a flash filesystem that is not a guarantee the old blocks are gone,
     * but it does mean the file's own extent no longer holds ciphertext, and
     * it costs nothing.
     */
    fun delete(id: String): Boolean {
        val file = File(directory, id)
        if (!file.isFile || file.parentFile != directory) return false
        try {
            RandomAccessFile(file, "rw").use { raf ->
                val scratch = ByteArray(64 * 1024)
                var remaining = raf.length()
                raf.seek(0)
                while (remaining > 0) {
                    val chunk = minOf(remaining, scratch.size.toLong()).toInt()
                    java.security.SecureRandom().nextBytes(scratch)
                    raf.write(scratch, 0, chunk)
                    remaining -= chunk
                }
                raf.fd.sync()
            }
        } catch (e: Exception) {
            Log.w(TAG, "overwrite before delete failed; deleting anyway")
        }
        return file.delete()
    }

    fun count(): Int = list().size

    fun bytesUsed(): Long =
        directory.listFiles()?.sumOf { it.length() } ?: 0L

    private fun <T> read(id: String, block: (RandomAccessFile, VaultFormat.Header) -> T): T? {
        val file = File(directory, id)
        if (!file.isFile) return null
        return try {
            RandomAccessFile(file, "r").use { raf -> block(raf, VaultFormat.readHeader(raf)) }
        } catch (e: Exception) {
            Log.w(TAG, "could not read vault file")
            null
        }
    }

    private fun ByteArray.toBitmap(): Bitmap? = BitmapFactory.decodeByteArray(this, 0, size)

    companion object {
        private const val TAG = "Vault"
        private const val DIRECTORY = "vault"
        private const val TEMP_SUFFIX = ".part"
    }
}
