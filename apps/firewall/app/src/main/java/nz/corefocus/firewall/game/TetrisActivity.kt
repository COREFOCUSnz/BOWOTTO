package nz.corefocus.firewall.game

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import nz.corefocus.firewall.lock.PasscodeActivity
import nz.corefocus.firewall.ui.FirewallTheme

/**
 * The launcher activity, and as far as anyone browsing the phone is concerned,
 * the whole app.
 *
 * Nothing here references the vault beyond starting [PasscodeActivity] - no
 * vault strings, no gallery icon, nothing in the task switcher.
 */
class TetrisActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            FirewallTheme {
                TetrisScreen(
                    onSecretItem = {
                        startActivity(Intent(this, PasscodeActivity::class.java))
                    },
                )
            }
        }
    }
}
