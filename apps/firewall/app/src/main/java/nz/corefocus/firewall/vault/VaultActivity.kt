package nz.corefocus.firewall.vault

import android.app.Activity
import android.content.IntentSender
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Log
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import nz.corefocus.firewall.ui.FirewallTheme
import nz.corefocus.firewall.util.VaultSession

/**
 * The vault itself. Only ever reached with an unlocked [VaultSession].
 */
class VaultActivity : ComponentActivity() {

    private lateinit var repository: VaultRepository
    private val thumbnails = ThumbnailCache()

    private var onImportFinished: (() -> Unit)? = null

    private val pickPhotos = registerForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(MAX_PER_IMPORT),
    ) { uris -> if (uris.isNotEmpty()) importAll(uris) }

    private val confirmOriginalDelete = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult(),
    ) { result ->
        val removed = result.resultCode == Activity.RESULT_OK
        toast(if (removed) "Originals removed from Gallery" else "Originals left in Gallery")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        val key = VaultSession.keyOrNull()
        if (key == null) {
            // Belt and braces: onResume enforces this too, but a process death
            // and restore could land us here with no session at all.
            finish()
            return
        }
        repository = VaultRepository(this, key)

        setContent {
            FirewallTheme {
                VaultScreen(
                    repository = repository,
                    thumbnails = thumbnails,
                    onAddPhotos = { onFinished ->
                        onImportFinished = onFinished
                        // The picker is another app, so the process goes to the
                        // background and the auto-lock would fire. Excuse it.
                        VaultSession.allowBriefAbsence()
                        pickPhotos.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                        )
                    },
                    onLock = {
                        VaultSession.lock()
                        thumbnails.clear()
                        finish()
                    },
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // If the vault locked while we were away, there is nothing to show.
        if (!VaultSession.isUnlocked) {
            thumbnails.clear()
            finish()
        }
    }

    override fun onDestroy() {
        thumbnails.clear()
        super.onDestroy()
    }

    private fun importAll(uris: List<Uri>) {
        lifecycleScope.launch {
            val imported = withContext(Dispatchers.IO) {
                uris.count { repository.import(it) != null }
            }
            onImportFinished?.invoke()
            onImportFinished = null

            if (imported == 0) {
                toast("Could not read those photos")
                return@launch
            }
            toast("Added $imported to the vault")
            offerToDeleteOriginals(uris)
        }
    }

    /**
     * The other half of the job: a copy in the vault is worth little while the
     * original still sits in Samsung Gallery for anyone to scroll past.
     *
     * From Android 11 this is a single system dialog that needs no storage
     * permission at all. Below that, deleting another app's media requires the
     * broad storage permission, which this app deliberately does not hold - so
     * it says so and leaves the originals alone rather than asking for a
     * permission that would itself look suspicious in the app's settings page.
     */
    private fun offerToDeleteOriginals(uris: List<Uri>) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            toast("Delete the originals in Gallery when you are ready")
            return
        }
        try {
            val sender: IntentSender = MediaStore.createDeleteRequest(contentResolver, uris).intentSender
            VaultSession.allowBriefAbsence()
            confirmOriginalDelete.launch(IntentSenderRequest.Builder(sender).build())
        } catch (e: Exception) {
            Log.w(TAG, "could not build a delete request", e)
            toast("Delete the originals in Gallery when you are ready")
        }
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    companion object {
        private const val TAG = "Vault"

        /** A ceiling on one import so a stray "select all" cannot wedge the app. */
        private const val MAX_PER_IMPORT = 30
    }
}
