package nz.corefocus.firewall.crypto

import android.content.Context
import java.util.Base64

/**
 * The handful of non-secret values the lock needs to persist: the salt, the
 * iteration count, the double-wrapped vault key and the failed-attempt tally.
 *
 * It is an interface purely so the key manager can be exercised on a desktop
 * JVM against a map, with no Android around it.
 */
interface KeyStorage {
    fun getString(key: String): String?
    fun putString(key: String, value: String?)
    fun getLong(key: String, fallback: Long): Long
    fun putLong(key: String, value: Long)
    fun getInt(key: String, fallback: Int): Int
    fun putInt(key: String, value: Int)
    fun clear()

    // java.util.Base64 rather than android.util.Base64: it exists from API 26
    // up, which is this app's floor, and it keeps this file runnable off-device.
    fun getBytes(key: String): ByteArray? =
        getString(key)?.let { Base64.getDecoder().decode(it) }

    fun putBytes(key: String, value: ByteArray?) =
        putString(key, value?.let { Base64.getEncoder().encodeToString(it) })
}

class PrefsKeyStorage(context: Context) : KeyStorage {

    // Plain SharedPreferences is correct here: everything stored is either
    // public (salt, iteration count) or already sealed twice over. Nothing in
    // this file is usable without the passcode AND this specific handset.
    private val prefs = context.applicationContext
        .getSharedPreferences("firewall.lock", Context.MODE_PRIVATE)

    override fun getString(key: String): String? = prefs.getString(key, null)

    override fun putString(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }

    override fun getLong(key: String, fallback: Long): Long = prefs.getLong(key, fallback)

    override fun putLong(key: String, value: Long) {
        prefs.edit().putLong(key, value).apply()
    }

    override fun getInt(key: String, fallback: Int): Int = prefs.getInt(key, fallback)

    override fun putInt(key: String, value: Int) {
        prefs.edit().putInt(key, value).apply()
    }

    override fun clear() {
        prefs.edit().clear().apply()
    }
}

/** In-memory storage, for tests. */
class MapKeyStorage : KeyStorage {
    private val map = mutableMapOf<String, Any>()

    override fun getString(key: String): String? = map[key] as? String

    override fun putString(key: String, value: String?) {
        if (value == null) map.remove(key) else map[key] = value
    }

    override fun getLong(key: String, fallback: Long): Long = map[key] as? Long ?: fallback

    override fun putLong(key: String, value: Long) {
        map[key] = value
    }

    override fun getInt(key: String, fallback: Int): Int = map[key] as? Int ?: fallback

    override fun putInt(key: String, value: Int) {
        map[key] = value
    }

    override fun clear() = map.clear()
}
