package nz.corefocus.firewall.vault

import nz.corefocus.firewall.crypto.Crypto
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException
import java.io.IOException
import java.io.OutputStream
import java.io.RandomAccessFile
import java.util.zip.CRC32
import javax.crypto.SecretKey

/**
 * The .fwl container - the "new type of file" the vault stores instead of
 * JPEGs.
 *
 * It is not an image file and no gallery, media scanner or file manager will
 * open it. Three independently sealed sections sit behind a small plaintext
 * header, so the grid can pull a 200px thumbnail out of a 12MB photo without
 * decrypting the photo:
 *
 *     [ 32-byte header, plaintext, CRC-checked ]
 *     [ sealed thumbnail ]   AES-GCM, aad = fwl/thumb
 *     [ sealed metadata  ]   AES-GCM, aad = fwl/meta
 *     [ sealed image     ]   AES-GCM, aad = fwl/image
 *
 * The header is plaintext on purpose: it holds only lengths and a creation
 * timestamp, and it lets a corrupted file be recognised as a .fwl and skipped
 * rather than crashing the grid. Everything that could identify the picture -
 * its name, size, source - lives in the sealed metadata section.
 *
 * The per-section AAD is what stops a section being moved between files or
 * swapped with another section of the same file: the tag is bound to its role.
 */
object VaultFormat {

    val MAGIC = byteArrayOf('F'.code.toByte(), 'W'.code.toByte(), 'L'.code.toByte(), '1'.code.toByte())
    const val VERSION = 1
    const val HEADER_BYTES = 32
    const val EXTENSION = "fwl"

    private val AAD_THUMB = "fwl/thumb".toByteArray()
    private val AAD_META = "fwl/meta".toByteArray()
    private val AAD_IMAGE = "fwl/image".toByteArray()

    /** Everything we know about the original, kept sealed. */
    data class Meta(
        val displayName: String,
        val width: Int,
        val height: Int,
        val sourceBytes: Long,
        val capturedAtEpochMillis: Long,
    )

    data class Header(
        val version: Int,
        val createdAtEpochMillis: Long,
        val thumbLength: Int,
        val metaLength: Int,
        val imageLength: Int,
    ) {
        val thumbOffset: Long get() = HEADER_BYTES.toLong()
        val metaOffset: Long get() = thumbOffset + thumbLength
        val imageOffset: Long get() = metaOffset + metaLength
    }

    class MalformedFileException(message: String) : IOException(message)

    /**
     * Writes a complete .fwl. The caller supplies already-encoded bytes so this
     * stays free of Android imaging types and can be tested with any three
     * byte arrays.
     */
    fun write(
        out: OutputStream,
        key: SecretKey,
        meta: Meta,
        thumbnail: ByteArray,
        image: ByteArray,
        createdAtEpochMillis: Long = System.currentTimeMillis(),
    ) {
        val sealedThumb = Crypto.encrypt(key, thumbnail, AAD_THUMB)
        val sealedMeta = Crypto.encrypt(key, encodeMeta(meta), AAD_META)
        val sealedImage = Crypto.encrypt(key, image, AAD_IMAGE)

        val header = ByteArray(HEADER_BYTES)
        MAGIC.copyInto(header, 0)
        writeShort(header, 4, VERSION)
        writeShort(header, 6, HEADER_BYTES)
        writeLong(header, 8, createdAtEpochMillis)
        writeInt(header, 16, sealedThumb.size)
        writeInt(header, 20, sealedMeta.size)
        writeInt(header, 24, sealedImage.size)
        writeInt(header, 28, crc32(header, 0, 28))

        out.write(header)
        out.write(sealedThumb)
        out.write(sealedMeta)
        out.write(sealedImage)
        out.flush()
    }

    fun readHeader(file: RandomAccessFile): Header {
        if (file.length() < HEADER_BYTES) throw MalformedFileException("shorter than a header")
        val header = ByteArray(HEADER_BYTES)
        file.seek(0)
        file.readFully(header)
        return parseHeader(header)
    }

    fun parseHeader(header: ByteArray): Header {
        if (header.size < HEADER_BYTES) throw MalformedFileException("shorter than a header")
        for (i in MAGIC.indices) {
            if (header[i] != MAGIC[i]) throw MalformedFileException("not a .fwl file")
        }
        val stored = readInt(header, 28)
        if (stored != crc32(header, 0, 28)) throw MalformedFileException("header CRC mismatch")

        val version = readShort(header, 4)
        if (version != VERSION) throw MalformedFileException("unsupported .fwl version $version")

        val thumb = readInt(header, 16)
        val meta = readInt(header, 20)
        val image = readInt(header, 24)
        if (thumb < 0 || meta < 0 || image < 0) throw MalformedFileException("negative section length")

        return Header(
            version = version,
            createdAtEpochMillis = readLong(header, 8),
            thumbLength = thumb,
            metaLength = meta,
            imageLength = image,
        )
    }

    fun readThumbnail(file: RandomAccessFile, key: SecretKey, header: Header): ByteArray =
        Crypto.decrypt(key, section(file, header.thumbOffset, header.thumbLength), AAD_THUMB)

    fun readMeta(file: RandomAccessFile, key: SecretKey, header: Header): Meta =
        decodeMeta(Crypto.decrypt(key, section(file, header.metaOffset, header.metaLength), AAD_META))

    fun readImage(file: RandomAccessFile, key: SecretKey, header: Header): ByteArray =
        Crypto.decrypt(key, section(file, header.imageOffset, header.imageLength), AAD_IMAGE)

    private fun section(file: RandomAccessFile, offset: Long, length: Int): ByteArray {
        if (offset + length > file.length()) throw MalformedFileException("section runs past EOF")
        val bytes = ByteArray(length)
        file.seek(offset)
        try {
            file.readFully(bytes)
        } catch (e: EOFException) {
            throw MalformedFileException("truncated section at $offset")
        }
        return bytes
    }

    // -- metadata encoding -------------------------------------------------
    // Length-prefixed binary rather than JSON: no parser to get wrong, no
    // dependency, and it round-trips byte for byte, which the test asserts.

    internal fun encodeMeta(meta: Meta): ByteArray {
        val buffer = ByteArrayOutputStream()
        DataOutputStream(buffer).use { out ->
            out.writeUTF(meta.displayName)
            out.writeInt(meta.width)
            out.writeInt(meta.height)
            out.writeLong(meta.sourceBytes)
            out.writeLong(meta.capturedAtEpochMillis)
        }
        return buffer.toByteArray()
    }

    internal fun decodeMeta(bytes: ByteArray): Meta =
        DataInputStream(bytes.inputStream()).use { input ->
            Meta(
                displayName = input.readUTF(),
                width = input.readInt(),
                height = input.readInt(),
                sourceBytes = input.readLong(),
                capturedAtEpochMillis = input.readLong(),
            )
        }

    // -- big-endian scalars ------------------------------------------------

    private fun writeShort(target: ByteArray, at: Int, value: Int) {
        target[at] = (value ushr 8).toByte()
        target[at + 1] = value.toByte()
    }

    private fun writeInt(target: ByteArray, at: Int, value: Int) {
        for (i in 0 until 4) target[at + i] = (value ushr (24 - 8 * i)).toByte()
    }

    private fun writeLong(target: ByteArray, at: Int, value: Long) {
        for (i in 0 until 8) target[at + i] = (value ushr (56 - 8 * i)).toByte()
    }

    private fun readShort(source: ByteArray, at: Int): Int =
        ((source[at].toInt() and 0xFF) shl 8) or (source[at + 1].toInt() and 0xFF)

    private fun readInt(source: ByteArray, at: Int): Int {
        var value = 0
        for (i in 0 until 4) value = (value shl 8) or (source[at + i].toInt() and 0xFF)
        return value
    }

    private fun readLong(source: ByteArray, at: Int): Long {
        var value = 0L
        for (i in 0 until 8) value = (value shl 8) or (source[at + i].toLong() and 0xFF)
        return value
    }

    private fun crc32(bytes: ByteArray, offset: Int, length: Int): Int {
        val crc = CRC32()
        crc.update(bytes, offset, length)
        return crc.value.toInt()
    }
}
