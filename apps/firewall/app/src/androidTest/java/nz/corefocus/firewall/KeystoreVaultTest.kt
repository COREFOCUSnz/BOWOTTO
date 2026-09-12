package nz.corefocus.firewall

import androidx.test.ext.junit.runners.AndroidJUnit4
import nz.corefocus.firewall.crypto.Crypto
import nz.corefocus.firewall.crypto.KeystoreDeviceGuard
import nz.corefocus.firewall.crypto.MapKeyStorage
import nz.corefocus.firewall.crypto.VaultKeyManager
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.security.KeyStore
import java.util.UUID

/**
 * The tests that only a real device can run.
 *
 * These exist because of a bug that reached a phone: the Keystore guard built
 * its own GCM nonce, which AndroidKeyStore rejects outright for encryption
 * ("Caller-provided IV not permitted") when the key requires randomised
 * encryption. It threw on first run, inside vault creation, and the app died
 * back to the decoy game.
 *
 * Every unit test passed throughout, because they all run against
 * `DeviceGuard.PASSTHROUGH` - there is no AndroidKeyStore on a desktop JVM.
 * The seal path had never executed anywhere. A whole layer of the key
 * hierarchy was untested and the suite looked green, which is the worst shape
 * a test suite can be in.
 *
 * So: anything that touches the Keystore gets asserted here, on hardware.
 */
@RunWith(AndroidJUnit4::class)
class KeystoreVaultTest {

    /** A per-run alias, so tests never collide with each other or a real vault. */
    private lateinit var alias: String
    private lateinit var guard: KeystoreDeviceGuard

    @Before
    fun setUp() {
        alias = "firewall.test.${UUID.randomUUID()}"
        guard = KeystoreDeviceGuard(alias)
    }

    @After
    fun tearDown() {
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias)
    }

    /**
     * The exact call that used to throw. If this regresses, the app cannot
     * create a vault at all, so it is worth stating on its own before any of
     * the round-trip assertions below.
     */
    @Test
    fun sealDoesNotThrowOnAKeyThatRequiresRandomisedEncryption() {
        guard.seal("anything".toByteArray())
    }

    @Test
    fun sealedBytesComeBackUnchanged() {
        val secret = Crypto.randomBytes(32)
        assertArrayEquals(secret, guard.unseal(guard.seal(secret)))
    }

    @Test
    fun sealedBytesAreNotThePlaintext() {
        val secret = Crypto.randomBytes(32)
        val sealed = guard.seal(secret)
        assertFalse(
            "the guard passed the plaintext through",
            sealed.toList().windowed(secret.size).any { it == secret.toList() },
        )
    }

    /** Each seal draws a fresh keystore IV, so the same input never repeats. */
    @Test
    fun twoSealsOfTheSameInputDiffer() {
        val secret = Crypto.randomBytes(32)
        assertFalse(guard.seal(secret).contentEquals(guard.seal(secret)))
    }

    /**
     * A blob sealed under one keystore key must be useless to another. This is
     * the property that makes the vault device-bound: copy the app's data to
     * another phone and the outer wrap can never be removed.
     */
    @Test
    fun anotherKeystoreKeyCannotUnsealIt() {
        val otherAlias = "firewall.test.${UUID.randomUUID()}"
        val other = KeystoreDeviceGuard(otherAlias)
        try {
            val sealed = guard.seal(Crypto.randomBytes(32))
            var failed = false
            try {
                other.unseal(sealed)
            } catch (expected: Exception) {
                failed = true
            }
            assertTrue("a foreign keystore key opened the blob", failed)
        } finally {
            KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(otherAlias)
        }
    }

    /**
     * The full first-run flow against real hardware: create the vault, then
     * reopen it the way a cold start would, with a new manager over the same
     * storage. This is the journey that was broken end to end.
     */
    @Test
    fun aVaultCreatedOnThisDeviceReopensWithTheSamePasscode() {
        val storage = MapKeyStorage()
        val created = VaultKeyManager(storage, guard).setUp("314159".toCharArray())

        val reopened = VaultKeyManager(storage, guard).unlock("314159".toCharArray())
        assertTrue("could not reopen the vault", reopened is VaultKeyManager.Unlock.Success)
        assertArrayEquals(
            created.encoded,
            (reopened as VaultKeyManager.Unlock.Success).key.encoded,
        )
    }

    @Test
    fun theWrongPasscodeStillFailsWithARealKeystore() {
        val storage = MapKeyStorage()
        val subject = VaultKeyManager(storage, guard)
        subject.setUp("314159".toCharArray())
        assertTrue(subject.unlock("271828".toCharArray()) is VaultKeyManager.Unlock.Wrong)
    }

    /**
     * changePasscode goes through the same seal path as setUp, so it had the
     * same bug and needs the same proof. If the key came back different here,
     * every photo already in the gallery would be unreadable.
     */
    @Test
    fun changingThePasscodeKeepsTheVaultKeyOnRealHardware() {
        val storage = MapKeyStorage()
        val subject = VaultKeyManager(storage, guard)
        val original = subject.setUp("314159".toCharArray())

        assertTrue(subject.changePasscode("314159".toCharArray(), "271828".toCharArray()))

        val reopened = subject.unlock("271828".toCharArray())
        assertTrue(reopened is VaultKeyManager.Unlock.Success)
        assertArrayEquals(
            original.encoded,
            (reopened as VaultKeyManager.Unlock.Success).key.encoded,
        )
    }
}
