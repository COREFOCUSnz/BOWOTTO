package nz.corefocus.firewall.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * A second wrap around the passcode-wrapped vault key, using a key that never
 * leaves the phone's keystore (hardware-backed or StrongBox where Samsung
 * offers it, which is most devices from the S9 on).
 *
 * Why bother, when the passcode already wraps the key? Because a short PIN is
 * brute-forceable in seconds if someone copies the app's data off the device
 * and attacks it on a desktop. With this layer they cannot: the outer
 * ciphertext can only be opened by a key that cannot be exported, so every
 * guess has to be made on this handset, one Keystore call at a time.
 */
interface DeviceGuard {
    fun seal(plaintext: ByteArray): ByteArray
    fun unseal(sealed: ByteArray): ByteArray

    companion object {
        /** For unit tests and desktop runs, where no Keystore exists. */
        val PASSTHROUGH: DeviceGuard = object : DeviceGuard {
            override fun seal(plaintext: ByteArray) = plaintext.copyOf()
            override fun unseal(sealed: ByteArray) = sealed.copyOf()
        }
    }
}

class KeystoreDeviceGuard(
    private val alias: String = DEFAULT_ALIAS,
) : DeviceGuard {

    /**
     * Note this does NOT go through [Crypto.encrypt], and must not.
     *
     * Keystore keys are created with `setRandomizedEncryptionRequired(true)`,
     * which forbids a caller-supplied IV: the keystore insists on generating
     * its own, and `init(ENCRYPT_MODE, key, GCMParameterSpec(...))` throws
     * `InvalidAlgorithmParameterException: Caller-provided IV not permitted`.
     * So init with no parameters and read the IV back off the cipher.
     *
     * This cost the first build on a real phone: [Crypto.encrypt] supplies its
     * own nonce, which is right for every other key in the app and fatal for
     * this one. It threw on first run, inside vault creation, and the app died
     * back to the game. Nothing caught it because the unit tests run against
     * DeviceGuard.PASSTHROUGH - there is no Keystore on a desktop JVM - so
     * this method had never once executed. The instrumented test in
     * androidTest covers it now.
     */
    override fun seal(plaintext: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(AAD)
        val sealed = cipher.doFinal(plaintext)

        val iv = cipher.iv
        check(iv.size == Crypto.NONCE_BYTES) {
            // Would silently corrupt the layout unseal() expects.
            "keystore produced a ${iv.size}-byte IV, expected ${Crypto.NONCE_BYTES}"
        }
        return iv + sealed
    }

    /** Decryption is the direction where passing the IV is both required and allowed. */
    override fun unseal(sealed: ByteArray): ByteArray {
        require(sealed.size > Crypto.NONCE_BYTES) { "sealed blob is too short to hold an IV" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            key(),
            GCMParameterSpec(Crypto.TAG_BITS, sealed, 0, Crypto.NONCE_BYTES),
        )
        cipher.updateAAD(AAD)
        return cipher.doFinal(sealed, Crypto.NONCE_BYTES, sealed.size - Crypto.NONCE_BYTES)
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(PROVIDER).apply { load(null) }
        (store.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(Crypto.KEY_BITS)
                // Deliberately NOT setUserAuthenticationRequired: the vault's
                // own passcode is the gate, and tying this key to the device
                // lockscreen would lock the owner out on every PIN change.
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        const val DEFAULT_ALIAS = "firewall.vault.guard.v1"
        private const val PROVIDER = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private val AAD = "firewall/guard/v1".toByteArray()
    }
}
