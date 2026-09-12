package nz.corefocus.firewall.crypto

import java.security.GeneralSecurityException
import javax.crypto.SecretKey

/**
 * Owns the vault key and the passcode that gates it.
 *
 * The vault key itself is random and never derived from the passcode. That
 * matters: it means changing the passcode rewraps one 32-byte key rather than
 * re-encrypting every photo in the gallery, and it means a weak passcode never
 * weakens the file encryption itself, only the wrapper.
 *
 *     vaultKey            <- random, 256 bits, the thing that opens files
 *     kek                 <- PBKDF2(passcode, salt, iterations)
 *     wrapped             <- AES-GCM(kek, vaultKey)
 *     stored              <- DeviceGuard.seal(wrapped)
 *
 * Two independent things are therefore needed to read a single photo: the
 * passcode, and this physical phone.
 */
class VaultKeyManager(
    private val storage: KeyStorage,
    private val guard: DeviceGuard,
    private val clock: () -> Long = System::currentTimeMillis,
) {

    sealed interface Unlock {
        /** Caller now holds the vault key. Wipe it by calling [lock] when done. */
        data class Success(val key: SecretKey) : Unlock

        /** Wrong passcode. [remaining] is how many tries before the next lockout. */
        data class Wrong(val remaining: Int) : Unlock

        /** Too many wrong tries; the lock is cold until [untilEpochMillis]. */
        data class LockedOut(val untilEpochMillis: Long) : Unlock

        /** No vault has been created on this device yet. */
        data object NotSetUp : Unlock
    }

    val isSetUp: Boolean
        get() = storage.getBytes(KEY_WRAPPED) != null

    /**
     * Creates the vault. Refuses to run twice: overwriting the wrapped key
     * would orphan every file already in the gallery, permanently. Resetting is
     * [destroyEverything], which is explicit about what it costs.
     */
    fun setUp(passcode: CharArray): SecretKey {
        check(!isSetUp) { "vault already exists; use changePasscode or destroyEverything" }
        val vaultKey = Crypto.randomKey()
        writeWrapped(vaultKey, passcode)
        storage.putInt(KEY_FAILURES, 0)
        storage.putLong(KEY_LOCKED_UNTIL, 0L)
        return vaultKey
    }

    fun unlock(passcode: CharArray): Unlock {
        val wrapped = storage.getBytes(KEY_WRAPPED) ?: return Unlock.NotSetUp

        val lockedUntil = storage.getLong(KEY_LOCKED_UNTIL, 0L)
        if (clock() < lockedUntil) return Unlock.LockedOut(lockedUntil)

        val salt = storage.getBytes(KEY_SALT) ?: return Unlock.NotSetUp
        val iterations = storage.getInt(KEY_ITERATIONS, Crypto.DEFAULT_ITERATIONS)

        val kek = Crypto.deriveKey(passcode, salt, iterations)
        val raw = try {
            Crypto.decrypt(kek, guard.unseal(wrapped), AAD_WRAP)
        } catch (_: GeneralSecurityException) {
            // A bad GCM tag is the expected shape of "wrong passcode", but a
            // mangled prefs entry lands here too. Both mean the same thing to
            // the caller, and neither should say which it was.
            return registerFailure()
        }

        storage.putInt(KEY_FAILURES, 0)
        storage.putLong(KEY_LOCKED_UNTIL, 0L)
        val key = Crypto.keyFrom(raw)
        Crypto.wipe(raw)
        return Unlock.Success(key)
    }

    /**
     * Rewraps the existing vault key under a new passcode. The key is unchanged,
     * so nothing in the gallery has to be touched.
     */
    fun changePasscode(current: CharArray, next: CharArray): Boolean {
        val unlocked = unlock(current) as? Unlock.Success ?: return false
        writeWrapped(unlocked.key, next)
        return true
    }

    /**
     * Forgets the wrapped key and the salt. Every .fwl file on disk becomes
     * undecryptable by anyone including us, which is the point, but it is also
     * irreversible - the caller is responsible for having asked twice.
     */
    fun destroyEverything() = storage.clear()

    private fun writeWrapped(vaultKey: SecretKey, passcode: CharArray) {
        val salt = Crypto.randomBytes(Crypto.SALT_BYTES)
        val iterations = Crypto.DEFAULT_ITERATIONS
        val kek = Crypto.deriveKey(passcode, salt, iterations)
        val wrapped = guard.seal(Crypto.encrypt(kek, vaultKey.encoded, AAD_WRAP))

        storage.putBytes(KEY_SALT, salt)
        storage.putInt(KEY_ITERATIONS, iterations)
        storage.putBytes(KEY_WRAPPED, wrapped)
    }

    private fun registerFailure(): Unlock {
        val failures = storage.getInt(KEY_FAILURES, 0) + 1
        storage.putInt(KEY_FAILURES, failures)

        // Escalating delay rather than a wipe. A vault that erases itself after
        // a few fat-fingered entries is a vault that eats its owner's photos,
        // and someone else picking up the phone is far more likely than an
        // attacker with the patience to sit through these.
        val over = failures - FREE_ATTEMPTS
        if (over <= 0) return Unlock.Wrong(remaining = -over)

        val delayMillis = LOCKOUT_STEPS[minOf(over - 1, LOCKOUT_STEPS.lastIndex)]
        val until = clock() + delayMillis
        storage.putLong(KEY_LOCKED_UNTIL, until)
        return Unlock.LockedOut(until)
    }

    companion object {
        private const val KEY_SALT = "salt"
        private const val KEY_ITERATIONS = "iterations"
        private const val KEY_WRAPPED = "wrapped"
        private const val KEY_FAILURES = "failures"
        private const val KEY_LOCKED_UNTIL = "locked_until"

        private val AAD_WRAP = "firewall/vaultkey/v1".toByteArray()

        const val FREE_ATTEMPTS = 5

        private val LOCKOUT_STEPS = longArrayOf(
            30_000L,
            60_000L,
            5 * 60_000L,
            15 * 60_000L,
            60 * 60_000L,
        )
    }
}
