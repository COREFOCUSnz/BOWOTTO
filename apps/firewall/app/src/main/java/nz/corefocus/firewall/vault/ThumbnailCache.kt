package nz.corefocus.firewall.vault

import android.graphics.Bitmap
import android.util.LruCache

/**
 * A small bounded cache of decrypted thumbnails.
 *
 * Bounded matters more here than in an ordinary gallery: a decoded 384px
 * thumbnail is around 590KB, so holding every one of a few hundred photos would
 * be tens of megabytes of *plaintext image data* sitting in the heap. This caps
 * it at an eighth of the heap and drops the rest, and [clear] is called the
 * moment the vault locks so nothing decrypted outlives the session.
 */
class ThumbnailCache {

    private val cache = object : LruCache<String, Bitmap>(maxBytes()) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    operator fun get(id: String): Bitmap? = cache.get(id)

    operator fun set(id: String, bitmap: Bitmap) {
        cache.put(id, bitmap)
    }

    fun remove(id: String) {
        cache.remove(id)
    }

    fun clear() = cache.evictAll()

    private companion object {
        fun maxBytes(): Int {
            val heapBytes = Runtime.getRuntime().maxMemory()
            return (heapBytes / 8).coerceIn(4L * 1024 * 1024, 32L * 1024 * 1024).toInt()
        }
    }
}
