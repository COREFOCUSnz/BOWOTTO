package nz.corefocus.firewall.util

import android.app.Activity
import android.os.Build
import android.view.WindowManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

/**
 * Decides when the vault's windows carry `FLAG_SECURE`.
 *
 * The flag does two separate jobs, and they are worth separating because the
 * owner wants one and not the other:
 *
 *  1. It blocks screenshots and screen recording.
 *  2. It blanks the window in the task switcher.
 *
 * Screenshots are allowed by default. The recents thumbnail is not: someone
 * who picks up the phone and double-taps recents would otherwise see a photo
 * out of the vault without ever meeting the passcode, which is the whole
 * threat this app exists for.
 *
 * Kept as a pure function so the truth table is testable off-device.
 */
object ScreenPrivacyPolicy {

    /**
     * @param allowScreenshots the owner's setting.
     * @param isForeground whether the window is the thing on screen right now.
     * @param canHideRecentsDirectly whether the platform offers
     *   `setRecentsScreenshotEnabled`, which suppresses the task-switcher
     *   thumbnail on its own (Android 13 and up).
     */
    fun needsSecureFlag(
        allowScreenshots: Boolean,
        isForeground: Boolean,
        canHideRecentsDirectly: Boolean,
    ): Boolean {
        // The owner turned screenshots off: the flag is simply on, always.
        if (!allowScreenshots) return true

        // Screenshots are on and the platform can hide the recents thumbnail
        // by itself, so the flag is never needed.
        if (canHideRecentsDirectly) return false

        // Screenshots are on and the platform cannot. Carry the flag only while
        // backgrounded, which is when the thumbnail is taken - so a screenshot
        // works while the vault is actually on screen.
        return !isForeground
    }
}

/**
 * Applies [ScreenPrivacyPolicy] to one activity's window across its lifecycle.
 *
 * Install it before `setContent` so the very first frame is already correct.
 */
class ScreenPrivacy(
    private val activity: Activity,
    private val allowScreenshots: () -> Boolean,
) : DefaultLifecycleObserver {

    private val canHideRecentsDirectly: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

    /** Call once, before the window has content. */
    fun install() {
        if (canHideRecentsDirectly) {
            // The dedicated API: no thumbnail in recents, screenshots untouched.
            activity.setRecentsScreenshotEnabled(false)
        }
        apply(isForeground = false)
    }

    override fun onResume(owner: LifecycleOwner) = apply(isForeground = true)

    override fun onPause(owner: LifecycleOwner) = apply(isForeground = false)

    /**
     * Re-reads the setting and updates the window. Call this when the owner
     * flips the toggle, so it takes effect without reopening the vault.
     */
    fun refresh() = apply(isForeground = true)

    private fun apply(isForeground: Boolean) {
        val secure = ScreenPrivacyPolicy.needsSecureFlag(
            allowScreenshots = allowScreenshots(),
            isForeground = isForeground,
            canHideRecentsDirectly = canHideRecentsDirectly,
        )
        if (secure) {
            activity.window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE,
            )
        } else {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
