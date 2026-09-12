package nz.corefocus.firewall

import android.graphics.Bitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import nz.corefocus.firewall.crypto.Crypto
import nz.corefocus.firewall.ui.FirewallTheme
import nz.corefocus.firewall.vault.ThumbnailCache
import nz.corefocus.firewall.vault.VaultFormat
import nz.corefocus.firewall.vault.VaultRepository
import nz.corefocus.firewall.vault.VaultScreen
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import javax.crypto.SecretKey

/**
 * Layout tests for the gallery, on a real screen with real constraints.
 *
 * These exist because of the second bug to reach a phone. The empty and
 * loading branches of the gallery used `Modifier.fillMaxSize()` inside a
 * Column, which takes the entire remaining height and leaves nothing for the
 * siblings below - so the screenshot toggle and the ADD PHOTOS button were
 * laid out past the bottom edge and simply could not be seen or tapped. A
 * fresh vault is always empty, so every first run hit it: you could get into
 * the vault and then had no way to put anything in it.
 *
 * Nothing caught it because the branch that was correct - the one with photos
 * in it, using `weight(1f)` - was the only one anybody had looked at, and no
 * test rendered this screen at all.
 *
 * `assertIsDisplayed` is the assertion that matters here, not
 * `assertExists`: the button existed the whole time. It was just off-screen.
 */
@RunWith(AndroidJUnit4::class)
class VaultScreenLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var key: SecretKey
    private lateinit var repository: VaultRepository

    @Before
    fun setUp() {
        // The repository writes into filesDir/vault, which persists between
        // tests on the same device, so start from a known-empty vault.
        File(context.filesDir, "vault").listFiles()?.forEach { it.delete() }
        key = Crypto.randomKey()
        repository = VaultRepository(context, key)
    }

    private fun show() {
        compose.setContent {
            FirewallTheme {
                VaultScreen(
                    repository = repository,
                    thumbnails = ThumbnailCache(),
                    allowScreenshots = true,
                    onAllowScreenshotsChange = {},
                    onAddPhotos = {},
                    onLock = {},
                )
            }
        }
    }

    /** The regression. An empty vault must still offer a way to fill it. */
    @Test
    fun addPhotosIsOnScreenWhenTheVaultIsEmpty() {
        show()
        compose.waitForIdle()
        compose.onNodeWithText("ADD PHOTOS").assertIsDisplayed()
    }

    /** The empty-state copy and the button have to coexist, not compete for height. */
    @Test
    fun theEmptyStateDoesNotPushTheControlsOffScreen() {
        show()
        compose.waitForIdle()
        compose.onNodeWithText("Nothing in here yet").assertIsDisplayed()
        compose.onNodeWithText("Allow screenshots").assertIsDisplayed()
        compose.onNodeWithText("ADD PHOTOS").assertIsDisplayed()
        compose.onNodeWithText("LOCK").assertIsDisplayed()
    }

    /**
     * The branch that was always correct, asserted anyway so a future change
     * cannot fix one branch and break the other unnoticed.
     */
    @Test
    fun addPhotosIsOnScreenWithPhotosInTheVault() {
        repeat(7) { writeVaultFile() }
        repository = VaultRepository(context, key)

        show()
        // The listing decrypts one metadata section per file off the main
        // thread, so the count arrives a beat after the first frame.
        compose.waitUntil(timeoutMillis = 10_000) {
            compose.onAllNodesWithText("7 items").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("ADD PHOTOS").assertIsDisplayed()
        compose.onNodeWithText("7 items").assertIsDisplayed()
    }

    /** Writes a real .fwl the repository can list, rather than mocking it out. */
    private fun writeVaultFile() {
        val bitmap = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888)
        val jpeg = ByteArrayOutputStream()
            .also { bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it) }
            .toByteArray()

        val directory = File(context.filesDir, "vault").apply { mkdirs() }
        File(directory, "${UUID.randomUUID()}.${VaultFormat.EXTENSION}")
            .outputStream()
            .use { out ->
                VaultFormat.write(
                    out = out,
                    key = key,
                    meta = VaultFormat.Meta(
                        displayName = "sample.jpg",
                        width = 64,
                        height = 64,
                        sourceBytes = jpeg.size.toLong(),
                        capturedAtEpochMillis = 0L,
                    ),
                    thumbnail = jpeg,
                    image = jpeg,
                )
            }
    }

}
