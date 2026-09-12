package nz.corefocus.firewall

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import nz.corefocus.firewall.crypto.KeystoreDeviceGuard
import nz.corefocus.firewall.crypto.PrefsKeyStorage
import nz.corefocus.firewall.crypto.VaultKeyManager
import nz.corefocus.firewall.util.VaultSession

class FirewallApp : Application() {

    val keyManager: VaultKeyManager by lazy {
        VaultKeyManager(PrefsKeyStorage(this), KeystoreDeviceGuard())
    }

    override fun onCreate() {
        super.onCreate()

        // The whole point of the app is that someone else might be holding the
        // phone. So the vault closes the moment it stops being the thing on
        // screen - task switcher, home button, a call - rather than on a timer.
        // The only exception is the short grace window the importer opens while
        // the system photo picker is in front.
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStop(owner: LifecycleOwner) = VaultSession.lockOnBackground()
            },
        )
    }
}
