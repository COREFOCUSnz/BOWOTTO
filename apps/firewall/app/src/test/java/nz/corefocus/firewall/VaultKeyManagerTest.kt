package nz.corefocus.firewall

import nz.corefocus.firewall.crypto.DeviceGuard
import nz.corefocus.firewall.crypto.MapKeyStorage
import nz.corefocus.firewall.crypto.VaultKeyManager
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * These run with [DeviceGuard.PASSTHROUGH] because AndroidKeyStore does not
 * exist on a desktop JVM. That is exactly the right seam: the guard is a pure
 * wrapper, so everything about the passcode logic is still under test here, and
 * the guard's own behaviour is one Keystore call that only a device can prove.
 */
class VaultKeyManagerTest {

    private var now = 1_000_000L

    private fun manager(storage: MapKeyStorage = MapKeyStorage()) =
        VaultKeyManager(storage, DeviceGuard.PASSTHROUGH) { now }

    @Test
    fun `the right passcode returns the same key every time`() {
        val storage = MapKeyStorage()
        val created = manager(storage).setUp("314159".toCharArray())

        val unlocked = manager(storage).unlock("314159".toCharArray())
        assertTrue(unlocked is VaultKeyManager.Unlock.Success)
        assertArrayEquals(
            created.encoded,
            (unlocked as VaultKeyManager.Unlock.Success).key.encoded,
        )
    }

    @Test
    fun `a wrong passcode does not open the vault`() {
        val storage = MapKeyStorage()
        manager(storage).setUp("314159".toCharArray())

        val outcome = manager(storage).unlock("314158".toCharArray())
        assertTrue(outcome is VaultKeyManager.Unlock.Wrong)
    }

    @Test
    fun `repeated failures reach a lockout, and a success clears it`() {
        val storage = MapKeyStorage()
        val subject = manager(storage)
        subject.setUp("314159".toCharArray())

        repeat(VaultKeyManager.FREE_ATTEMPTS) {
            assertTrue(subject.unlock("000000".toCharArray()) is VaultKeyManager.Unlock.Wrong)
        }
        val lockedOut = subject.unlock("000000".toCharArray())
        assertTrue(lockedOut is VaultKeyManager.Unlock.LockedOut)

        // Even the correct passcode is refused while the lockout stands.
        assertTrue(subject.unlock("314159".toCharArray()) is VaultKeyManager.Unlock.LockedOut)

        now = (lockedOut as VaultKeyManager.Unlock.LockedOut).untilEpochMillis + 1
        assertTrue(subject.unlock("314159".toCharArray()) is VaultKeyManager.Unlock.Success)

        // ...and the tally resets, so a near miss does not haunt the next session.
        assertTrue(subject.unlock("000000".toCharArray()) is VaultKeyManager.Unlock.Wrong)
    }

    @Test
    fun `changing the passcode keeps the same vault key`() {
        val storage = MapKeyStorage()
        val subject = manager(storage)
        val original = subject.setUp("314159".toCharArray())

        assertTrue(subject.changePasscode("314159".toCharArray(), "271828".toCharArray()))

        assertTrue(subject.unlock("314159".toCharArray()) is VaultKeyManager.Unlock.Wrong)
        val reopened = subject.unlock("271828".toCharArray())
        assertTrue(reopened is VaultKeyManager.Unlock.Success)

        // If this ever fails, every photo already in the gallery just became
        // unreadable, which is the worst bug this app can have.
        assertArrayEquals(
            original.encoded,
            (reopened as VaultKeyManager.Unlock.Success).key.encoded,
        )
    }

    @Test
    fun `changing the passcode with the wrong current one is refused`() {
        val storage = MapKeyStorage()
        val subject = manager(storage)
        subject.setUp("314159".toCharArray())

        assertFalse(subject.changePasscode("000000".toCharArray(), "271828".toCharArray()))
        assertTrue(subject.unlock("314159".toCharArray()) is VaultKeyManager.Unlock.Success)
    }

    @Test
    fun `two vaults with the same passcode get different keys`() {
        // Different salt per vault, so the same PIN on two phones - or before
        // and after a reset - never lands on the same key.
        val first = manager(MapKeyStorage()).setUp("314159".toCharArray())
        val second = manager(MapKeyStorage()).setUp("314159".toCharArray())
        assertFalse(first.encoded.contentEquals(second.encoded))
    }

    @Test
    fun `an untouched device reports no vault`() {
        val storage = MapKeyStorage()
        assertFalse(manager(storage).isSetUp)
        assertEquals(VaultKeyManager.Unlock.NotSetUp, manager(storage).unlock("314159".toCharArray()))
    }
}
