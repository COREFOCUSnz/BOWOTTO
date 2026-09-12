package nz.corefocus.firewall.util

import android.content.Context

/**
 * The owner's preferences. Deliberately a separate SharedPreferences file from
 * the lock's storage: nothing in here is security-critical, and it should never
 * sit next to the wrapped vault key where a careless `clear()` could take both.
 */
class AppSettings(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences("firewall.settings", Context.MODE_PRIVATE)

    /**
     * Whether screenshots and screen recording are allowed inside the vault.
     *
     * On by default. Turning it off restores `FLAG_SECURE` on every vault
     * window. Either way the task switcher shows nothing - see
     * [ScreenPrivacyPolicy].
     */
    var allowScreenshots: Boolean
        get() = prefs.getBoolean(KEY_ALLOW_SCREENSHOTS, true)
        set(value) = prefs.edit().putBoolean(KEY_ALLOW_SCREENSHOTS, value).apply()

    private companion object {
        const val KEY_ALLOW_SCREENSHOTS = "allow_screenshots"
    }
}
