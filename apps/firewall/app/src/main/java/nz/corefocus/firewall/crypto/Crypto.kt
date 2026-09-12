package nz.corefocus.firewall.crypto

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * The primitives every other layer builds on. Deliberately plain JCE with no
 * Android types, so the whole thing runs - and is tested - on a desktop JVM.
 *
 * One rule holds everywhere below: a nonce is never reused with a key. Every
 * [encrypt] draws a fresh 12 random bytes, and the output carries them.
 */
object Crypto {

    const val KEY_BITS = 256
    const val NONCE_BYTES = 12
    const val TAG_BITS = 128
    const val SALT_BYTES = 16

    /**
     * PBKDF2 cost. Stored alongside each wrapped key rather than assumed, so
     * raising it later does not strand vaults created by an older build.
     */
    const val DEFAULT_ITERATIONS = 200_000

    private val random = SecureRandom()

    fun randomBytes(count: Int): ByteArray = ByteArray(count).also(random::nextBytes)

    fun randomKey(): SecretKey = SecretKeySpec(randomBytes(KEY_BITS / 8), "AES")

    fun keyFrom(raw: ByteArray): SecretKey = SecretKeySpec(raw, "AES")

    /**
     * Stretches a passcode into a key-encryption key. A six-digit PIN has about
     * twenty bits of entropy, which is nothing on its own - the iteration count
     * here buys time, and DeviceGuard is what actually makes an offline attack
     * impractical by pinning the ciphertext to this phone's secure hardware.
     */
    fun deriveKey(passcode: CharArray, salt: ByteArray, iterations: Int): SecretKey {
        val spec = PBEKeySpec(passcode, salt, iterations, KEY_BITS)
        try {
            val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            return SecretKeySpec(factory.generateSecret(spec).encoded, "AES")
        } finally {
            spec.clearPassword()
        }
    }

    /** Returns nonce, then ciphertext, then GCM tag, in one array. */
    fun encrypt(key: SecretKey, plaintext: ByteArray, aad: ByteArray? = null): ByteArray {
        val nonce = randomBytes(NONCE_BYTES)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce))
        aad?.let(cipher::updateAAD)
        return nonce + cipher.doFinal(plaintext)
    }

    /**
     * Reverses [encrypt]. Throws [javax.crypto.AEADBadTagException] on a wrong
     * key or a tampered file - callers treat both the same way, because from
     * outside they are the same event: this blob is not ours.
     */
    fun decrypt(key: SecretKey, sealed: ByteArray, aad: ByteArray? = null): ByteArray {
        require(sealed.size > NONCE_BYTES) { "sealed blob is too short to hold a nonce" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, sealed, 0, NONCE_BYTES))
        aad?.let(cipher::updateAAD)
        return cipher.doFinal(sealed, NONCE_BYTES, sealed.size - NONCE_BYTES)
    }

    /** Overwrites key material we are done with. Best effort; the JVM may have copied it. */
    fun wipe(bytes: ByteArray) = bytes.fill(0)

    fun wipe(chars: CharArray) = chars.fill(' ')
}
