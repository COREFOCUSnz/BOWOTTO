package nz.corefocus.firewall

import nz.corefocus.firewall.util.ScreenPrivacyPolicy.needsSecureFlag
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The whole point of splitting the policy out of the activity is that this
 * table is checkable without a phone. Get a cell wrong and either the owner
 * cannot take a screenshot they asked for, or a photo from the vault turns up
 * in the task switcher for whoever is holding the phone.
 */
class ScreenPrivacyPolicyTest {

    @Test
    fun `screenshots off means the flag is always on`() {
        // Both foreground and background, on both platform generations.
        for (foreground in listOf(true, false)) {
            for (canHideRecents in listOf(true, false)) {
                assertTrue(
                    "foreground=$foreground canHideRecents=$canHideRecents",
                    needsSecureFlag(
                        allowScreenshots = false,
                        isForeground = foreground,
                        canHideRecentsDirectly = canHideRecents,
                    ),
                )
            }
        }
    }

    @Test
    fun `on a modern platform the flag is never needed when screenshots are allowed`() {
        // Android 13 and up suppresses the recents thumbnail on its own, so the
        // flag would only get in the way.
        assertFalse(needsSecureFlag(allowScreenshots = true, isForeground = true, canHideRecentsDirectly = true))
        assertFalse(needsSecureFlag(allowScreenshots = true, isForeground = false, canHideRecentsDirectly = true))
    }

    @Test
    fun `on an older platform the flag comes back only in the background`() {
        // This is the pair that matters. Foreground false would break the
        // screenshot the owner asked for...
        assertFalse(
            "a screenshot must work while the vault is on screen",
            needsSecureFlag(allowScreenshots = true, isForeground = true, canHideRecentsDirectly = false),
        )
        // ...and background false would leak a vault photo into recents.
        assertTrue(
            "the recents thumbnail must never show the vault",
            needsSecureFlag(allowScreenshots = true, isForeground = false, canHideRecentsDirectly = false),
        )
    }

    /**
     * Stated separately because it is the invariant the feature must not break.
     * Scoped to the older platforms on purpose: that is where the flag is the
     * only mechanism available, so it is where a regression would actually leak.
     * On 13 and up `setRecentsScreenshotEnabled` covers the same ground and the
     * flag is correctly absent.
     */
    @Test
    fun `without the modern API the background is protected either way`() {
        for (allow in listOf(true, false)) {
            assertTrue(
                "allowScreenshots=$allow left the background unprotected",
                needsSecureFlag(
                    allowScreenshots = allow,
                    isForeground = false,
                    canHideRecentsDirectly = false,
                ),
            )
        }
    }
}
