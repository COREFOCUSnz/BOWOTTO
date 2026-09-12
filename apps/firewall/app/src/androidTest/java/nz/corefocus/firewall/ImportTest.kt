package nz.corefocus.firewall

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import nz.corefocus.firewall.crypto.Crypto
import nz.corefocus.firewall.vault.ImageNormaliser
import nz.corefocus.firewall.vault.VaultRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import javax.crypto.SecretKey

/**
 * The import path, on a device, end to end: a real image file in, a real
 * `.fwl` on disk, real bitmaps back out.
 *
 * Written before anyone hit a bug in it, for once. Everything here runs on
 * Android's own imaging and EXIF stack and so had never executed on any
 * machine - the same shape as the two faults that did reach a phone
 * (`KeystoreDeviceGuard.seal`, and the gallery's empty-state layout). The
 * pattern was clear enough to act on rather than wait for.
 *
 * The EXIF assertion is the one that earns its place: docs/SECURITY.md claims
 * importing strips location and camera metadata, and until now that claim
 * rested entirely on the theory that re-encoding a bitmap cannot carry EXIF
 * with it.
 */
@RunWith(AndroidJUnit4::class)
class ImportTest {

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var key: SecretKey
    private lateinit var repository: VaultRepository

    @Before
    fun setUp() {
        File(context.filesDir, "vault").listFiles()?.forEach { it.delete() }
        key = Crypto.randomKey()
        repository = VaultRepository(context, key)
    }

    @Test
    fun aPhotoImportsAndComesBackOut() {
        val id = repository.import(sourceImage(1200, 900))
        assertNotNull("import returned null", id)

        val entries = repository.list()
        assertEquals(1, entries.size)
        assertEquals(1200, entries[0].width)
        assertEquals(900, entries[0].height)

        assertNotNull("no thumbnail came back", repository.thumbnail(id!!))

        val full = repository.image(id)
        assertNotNull("no image came back", full)
        assertEquals(1200, full!!.width)
        assertEquals(900, full.height)
    }

    /** The long edge is capped, so a big camera frame must come back smaller. */
    @Test
    fun anOversizeFrameIsCappedOnTheLongEdge() {
        val id = repository.import(sourceImage(5000, 2500))
        assertNotNull(id)

        val entry = repository.list().single()
        assertEquals(ImageNormaliser.MAX_EDGE, entry.width)
        assertTrue("aspect ratio was not preserved", entry.height in 1530..1545)
    }

    /**
     * The privacy claim, checked rather than assumed: GPS coordinates on the
     * way in, nothing on the way out.
     */
    @Test
    fun locationAndCameraMetadataDoNotSurviveTheImport() {
        val source = imageFileWithExif()

        // Sanity check the fixture first. If the source has no GPS, the
        // assertion below would pass for the wrong reason.
        ExifInterface(source.absolutePath).let { exif ->
            assertNotNull("the fixture never had GPS to strip", exif.latLong)
            assertEquals("FictionalCam", exif.getAttribute(ExifInterface.TAG_MAKE))
        }

        val id = repository.import(Uri.fromFile(source))
        assertNotNull(id)

        // Read the EXIF of what actually came out of the vault.
        val stored = File(context.cacheDir, "decrypted.jpg")
        stored.outputStream().use { out ->
            repository.image(id!!)!!.compress(Bitmap.CompressFormat.JPEG, 95, out)
        }
        ExifInterface(stored.absolutePath).let { exif ->
            assertNull("GPS survived the import", exif.latLong)
            assertNull("camera make survived", exif.getAttribute(ExifInterface.TAG_MAKE))
            assertNull("camera model survived", exif.getAttribute(ExifInterface.TAG_MODEL))
            assertNull("capture date survived", exif.getAttribute(ExifInterface.TAG_DATETIME))
        }
    }

    /** Nothing readable as an image may sit on disk. */
    @Test
    fun theFileOnDiskIsNotAnImage() {
        val id = repository.import(sourceImage(400, 400))
        assertNotNull(id)

        val onDisk = File(File(context.filesDir, "vault"), id!!).readBytes()
        assertTrue("does not start with the FWL1 magic", onDisk.copyOf(4).contentEquals("FWL1".toByteArray()))

        // A JPEG starts FF D8 FF. Ours must not, or a file manager would offer
        // to open it as a picture.
        assertTrue(
            "the vault file opens as a JPEG",
            !(onDisk[32] == 0xFF.toByte() && onDisk[33] == 0xD8.toByte()),
        )
    }

    @Test
    fun anUnreadableSourceIsRefusedRatherThanCrashing() {
        val notAnImage = File(context.cacheDir, "notes.txt").apply {
            writeText("this is not a photograph")
        }
        assertNull(repository.import(Uri.fromFile(notAnImage)))
        assertTrue("a failed import left a file behind", repository.list().isEmpty())
    }

    // -- fixtures ----------------------------------------------------------

    /** A recognisable gradient, so a decode fault would not read as a pass. */
    private fun bitmap(width: Int, height: Int): Bitmap =
        Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { target ->
            val canvas = Canvas(target)
            canvas.drawColor(Color.DKGRAY)
            val paint = Paint().apply { color = Color.rgb(80, 195, 247) }
            canvas.drawCircle(width / 2f, height / 2f, minOf(width, height) / 3f, paint)
        }

    private fun sourceImage(width: Int, height: Int): Uri {
        val file = File(context.cacheDir, "source-${width}x$height.jpg")
        file.outputStream().use { bitmap(width, height).compress(Bitmap.CompressFormat.JPEG, 95, it) }
        return Uri.fromFile(file)
    }

    private fun imageFileWithExif(): File {
        val file = File(context.cacheDir, "with-exif.jpg")
        file.outputStream().use { bitmap(800, 600).compress(Bitmap.CompressFormat.JPEG, 95, it) }

        ExifInterface(file.absolutePath).apply {
            setAttribute(ExifInterface.TAG_MAKE, "FictionalCam")
            setAttribute(ExifInterface.TAG_MODEL, "FC-1")
            setAttribute(ExifInterface.TAG_DATETIME, "2026:01:02 03:04:05")
            setLatLong(-41.286461, 174.776230)
            saveAttributes()
        }
        return file
    }
}
