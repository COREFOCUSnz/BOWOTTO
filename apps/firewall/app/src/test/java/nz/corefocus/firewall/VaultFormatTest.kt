package nz.corefocus.firewall

import nz.corefocus.firewall.crypto.Crypto
import nz.corefocus.firewall.vault.VaultFormat
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.RandomAccessFile
import java.util.zip.CRC32
import javax.crypto.AEADBadTagException

class VaultFormatTest {

    @get:Rule
    val folder = TemporaryFolder()

    private val key = Crypto.randomKey()

    private val meta = VaultFormat.Meta(
        displayName = "IMG_2291.jpg",
        width = 3024,
        height = 4032,
        sourceBytes = 4_112_908L,
        capturedAtEpochMillis = 1_760_000_000_000L,
    )

    private val thumbnail = ByteArray(2048) { (it * 31 and 0xFF).toByte() }
    private val image = ByteArray(64_000) { (it * 7 and 0xFF).toByte() }

    private fun writeSample(target: File = folder.newFile("sample.fwl")): File {
        target.outputStream().use { VaultFormat.write(it, key, meta, thumbnail, image) }
        return target
    }

    @Test
    fun `round trips every section`() {
        val file = writeSample()
        RandomAccessFile(file, "r").use { raf ->
            val header = VaultFormat.readHeader(raf)
            assertEquals(VaultFormat.VERSION, header.version)
            assertArrayEquals(thumbnail, VaultFormat.readThumbnail(raf, key, header))
            assertArrayEquals(image, VaultFormat.readImage(raf, key, header))
            assertEquals(meta, VaultFormat.readMeta(raf, key, header))
        }
    }

    /**
     * The point of the whole exercise: what lands on disk must not be the photo,
     * and must not be recognisable as any image format.
     */
    @Test
    fun `nothing on disk resembles the plaintext`() {
        val bytes = writeSample().readBytes()

        assertTrue("should start with the FWL1 magic", bytes.copyOf(4).contentEquals(VaultFormat.MAGIC))

        // No run of the plaintext image or thumbnail survives anywhere in the
        // file. Note there is deliberately no "contains no JPEG SOI marker"
        // check here: over 64KB of ciphertext a random FF D8 pair is expected
        // about once, so such a test would fail at random and teach us nothing.
        assertTrue("ciphertext contains a plaintext image run", indexOf(bytes, image.copyOfRange(0, 64)) < 0)
        assertTrue("ciphertext contains a plaintext thumb run", indexOf(bytes, thumbnail.copyOfRange(0, 64)) < 0)
        assertTrue("metadata leaked in the clear", indexOf(bytes, meta.displayName.toByteArray()) < 0)
    }

    @Test
    fun `a different key cannot open a section`() {
        val file = writeSample()
        RandomAccessFile(file, "r").use { raf ->
            val header = VaultFormat.readHeader(raf)
            try {
                VaultFormat.readImage(raf, Crypto.randomKey(), header)
                fail("a foreign key opened the image section")
            } catch (expected: AEADBadTagException) {
                // Correct.
            }
        }
    }

    /**
     * The per-section AAD exists so a section cannot be lifted out of its slot.
     * This crafts the file an attacker would build - the sealed image bytes
     * sitting where the thumbnail belongs, under a header with a valid CRC -
     * and reads it back through the real reader, so it is the format's own AAD
     * constants under test rather than a pair of strings retyped here.
     */
    @Test
    fun `sections are bound to their role`() {
        val original = writeSample()
        val (header, body) = RandomAccessFile(original, "r").use { raf ->
            val h = VaultFormat.readHeader(raf)
            val sealedImage = ByteArray(h.imageLength).also {
                raf.seek(h.imageOffset)
                raf.readFully(it)
            }
            h to sealedImage
        }

        val forged = folder.newFile("forged.fwl")
        forged.outputStream().use { out ->
            out.write(craftHeader(thumbLength = header.imageLength, metaLength = 0, imageLength = 0))
            out.write(body)
        }

        RandomAccessFile(forged, "r").use { raf ->
            // The header must still be accepted - otherwise this proves nothing
            // about the AAD, only that the CRC works.
            val forgedHeader = VaultFormat.readHeader(raf)
            assertEquals(header.imageLength, forgedHeader.thumbLength)
            try {
                VaultFormat.readThumbnail(raf, key, forgedHeader)
                fail("an image section was accepted in the thumbnail slot")
            } catch (expected: AEADBadTagException) {
                // Correct.
            }
        }
    }

    /** Builds a valid, CRC-correct .fwl header. The attacker's half of the test. */
    private fun craftHeader(thumbLength: Int, metaLength: Int, imageLength: Int): ByteArray {
        val header = ByteArray(VaultFormat.HEADER_BYTES)
        VaultFormat.MAGIC.copyInto(header, 0)
        header[5] = VaultFormat.VERSION.toByte()
        header[7] = VaultFormat.HEADER_BYTES.toByte()
        putInt(header, 16, thumbLength)
        putInt(header, 20, metaLength)
        putInt(header, 24, imageLength)
        val crc = CRC32().apply { update(header, 0, 28) }.value.toInt()
        putInt(header, 28, crc)
        return header
    }

    private fun putInt(target: ByteArray, at: Int, value: Int) {
        for (i in 0 until 4) target[at + i] = (value ushr (24 - 8 * i)).toByte()
    }

    @Test
    fun `a flipped header byte is rejected`() {
        val file = writeSample()
        val bytes = file.readBytes()
        bytes[18] = (bytes[18] + 1).toByte() // inside the thumbnail length field
        file.writeBytes(bytes)

        try {
            RandomAccessFile(file, "r").use { VaultFormat.readHeader(it) }
            fail("a corrupted header was accepted")
        } catch (expected: VaultFormat.MalformedFileException) {
            assertTrue(expected.message!!.contains("CRC"))
        }
    }

    @Test
    fun `a foreign file is not mistaken for a vault file`() {
        val file = folder.newFile("holiday.jpg")
        file.writeBytes(ByteArray(512) { 0x41 })
        try {
            RandomAccessFile(file, "r").use { VaultFormat.readHeader(it) }
            fail("a JPEG was accepted as a .fwl")
        } catch (expected: VaultFormat.MalformedFileException) {
            assertTrue(expected.message!!.contains("not a .fwl"))
        }
    }

    @Test
    fun `metadata survives unicode and an empty name`() {
        listOf("", "тест фото.png", "a".repeat(300)).forEach { name ->
            val sample = meta.copy(displayName = name)
            assertEquals(sample, VaultFormat.decodeMeta(VaultFormat.encodeMeta(sample)))
        }
    }

    @Test
    fun `two writes of the same photo produce different bytes`() {
        // Fresh nonces every time. Identical ciphertext would leak that two
        // vault entries hold the same picture.
        val first = writeSample(folder.newFile("a.fwl")).readBytes()
        val second = writeSample(folder.newFile("b.fwl")).readBytes()
        val skipHeader = VaultFormat.HEADER_BYTES
        assertNotEquals(
            first.copyOfRange(skipHeader, skipHeader + 64).toList(),
            second.copyOfRange(skipHeader, skipHeader + 64).toList(),
        )
    }

    private fun indexOf(haystack: ByteArray, needle: ByteArray): Int {
        outer@ for (i in 0..haystack.size - needle.size) {
            for (j in needle.indices) if (haystack[i + j] != needle[j]) continue@outer
            return i
        }
        return -1
    }
}
