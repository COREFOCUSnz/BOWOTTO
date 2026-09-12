package nz.corefocus.firewall.lock

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import nz.corefocus.firewall.FirewallApp
import nz.corefocus.firewall.ui.FirewallTheme
import nz.corefocus.firewall.util.AppSettings
import nz.corefocus.firewall.util.ScreenPrivacy
import nz.corefocus.firewall.util.VaultSession
import nz.corefocus.firewall.vault.VaultActivity

/**
 * The gate. Sets up the vault on first run, unlocks it after that, and hands
 * the key to [VaultSession] before opening the gallery.
 *
 * Declared `noHistory` and `excludeFromRecents` in the manifest, so backing out
 * of here leaves no trace of it in the task switcher and no way to land back on
 * a half-entered PIN.
 */
class PasscodeActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Screenshots follow the owner's setting; the recents thumbnail never
        // does. Installed before setContent so the first frame is already right.
        val settings = AppSettings(this)
        lifecycle.addObserver(
            ScreenPrivacy(this) { settings.allowScreenshots }.also { it.install() },
        )

        val keyManager = (application as FirewallApp).keyManager

        setContent {
            FirewallTheme {
                PasscodeScreen(
                    keyManager = keyManager,
                    onUnlocked = { key ->
                        VaultSession.open(key)
                        startActivity(Intent(this, VaultActivity::class.java))
                        finish()
                    },
                    onGiveUp = { finish() },
                )
            }
        }
    }
}
