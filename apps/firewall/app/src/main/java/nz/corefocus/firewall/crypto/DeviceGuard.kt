package nz.corefocus.firewall.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

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

    override fun seal(plaintext: ByteArray): ByteArray =
        Crypto.encrypt(key(), plaintext, AAD)

    override fun unseal(sealed: ByteArray): ByteArray =
        Crypto.decrypt(key(), sealed, AAD)

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
        private val AAD = "firewall/guard/v1".toByteArray()
    }
}
