package nz.corefocus.firewall.lock

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import nz.corefocus.firewall.FirewallApp
import nz.corefocus.firewall.ui.FirewallTheme
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

        // No screenshots, no screen recording, no thumbnail in the recents
        // list. Set before setContent so the very first frame is protected.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

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
