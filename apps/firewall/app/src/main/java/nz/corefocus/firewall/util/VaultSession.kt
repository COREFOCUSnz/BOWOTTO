package nz.corefocus.firewall.util

import javax.crypto.SecretKey

/**
 * The unlocked key, held in memory only, for exactly as long as the vault is
 * open.
 *
 * It is a process-wide singleton rather than something passed between
 * activities on purpose: a SecretKey must never go into an Intent extra or a
 * saved instance state bundle, both of which get written to disk by the system.
 */
object VaultSession {

    @Volatile
    private var key: SecretKey? = null

    /**
     * Until this moment, leaving the app does not lock it. Set when we knowingly
     * hand control to another app - the system photo picker, mainly - because
     * otherwise every import would lock the vault behind the user's back.
     */
    @Volatile
    private var graceUntilEpochMillis: Long = 0L

    val isUnlocked: Boolean get() = key != null

    fun open(unlocked: SecretKey) {
        key = unlocked
    }

    fun require(): SecretKey =
        key ?: error("vault is locked; callers must check isUnlocked first")

    fun keyOrNull(): SecretKey? = key

    /** Drops the key. After this, nothing in the app can read a .fwl. */
    fun lock() {
        key = null
        graceUntilEpochMillis = 0L
    }

    fun allowBriefAbsence(millis: Long = DEFAULT_GRACE_MILLIS, now: Long = System.currentTimeMillis()) {
        graceUntilEpochMillis = now + millis
    }

    fun lockOnBackground(now: Long = System.currentTimeMillis()) {
        if (now < graceUntilEpochMillis) return
        lock()
    }

    const val DEFAULT_GRACE_MILLIS = 2 * 60_000L
}
