package nz.corefocus.firewall.lock

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import nz.corefocus.firewall.crypto.Crypto
import nz.corefocus.firewall.crypto.VaultKeyManager
import nz.corefocus.firewall.ui.Accent
import nz.corefocus.firewall.ui.Chalk
import nz.corefocus.firewall.ui.Danger
import nz.corefocus.firewall.ui.Ink
import nz.corefocus.firewall.ui.Muted
import nz.corefocus.firewall.ui.Panel
import javax.crypto.SecretKey
import kotlin.math.max

private const val TAG = "Firewall"
private const val MIN_LENGTH = 6
private const val MAX_LENGTH = 12

@Composable
fun PasscodeScreen(
    keyManager: VaultKeyManager,
    onUnlocked: (SecretKey) -> Unit,
    onGiveUp: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val creating = remember { !keyManager.isSetUp }

    var entry by remember { mutableStateOf("") }
    var confirming by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var isError by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var lockedUntil by remember { mutableLongStateOf(0L) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }

    // Only ticks while a lockout is actually running, so the screen is not
    // waking once a second for no reason the rest of the time.
    LaunchedEffect(lockedUntil) {
        while (lockedUntil > System.currentTimeMillis()) {
            now = System.currentTimeMillis()
            delay(500)
        }
        now = System.currentTimeMillis()
    }

    val secondsLeft = max(0L, (lockedUntil - now + 999) / 1000)
    val isLockedOut = secondsLeft > 0

    fun submit() {
        if (busy || isLockedOut) return
        val candidate = entry
        entry = ""

        if (creating) {
            val firstPass = confirming
            if (firstPass == null) {
                if (candidate.length < MIN_LENGTH) {
                    message = "Use at least $MIN_LENGTH digits"
                    isError = true
                    return
                }
                confirming = candidate
                message = "Enter it again to confirm"
                isError = false
                return
            }
            if (candidate != firstPass) {
                confirming = null
                message = "They did not match. Start again."
                isError = true
                return
            }
            busy = true
            scope.launch {
                val chars = candidate.toCharArray()
                // PBKDF2 at 200k iterations is roughly a second of CPU. Off the
                // main thread, or the whole screen freezes mid-unlock.
                //
                // Creating the vault touches the Android Keystore, which is the
                // one part of this flow that can fail for reasons that are
                // nothing to do with the passcode. An uncaught throw here used
                // to kill the process and drop the user back into the game with
                // no idea why, so it is caught and shown.
                val outcome = withContext(Dispatchers.Default) {
                    try {
                        Result.success(keyManager.setUp(chars))
                    } catch (e: Exception) {
                        Result.failure(e)
                    } finally {
                        Crypto.wipe(chars)
                    }
                }
                busy = false
                outcome.fold(
                    onSuccess = onUnlocked,
                    onFailure = { error ->
                        Log.e(TAG, "could not create the vault", error)
                        confirming = null
                        isError = true
                        message = "Could not create the vault on this device."
                    },
                )
            }
            return
        }

        busy = true
        scope.launch {
            val chars = candidate.toCharArray()
            val outcome = withContext(Dispatchers.Default) {
                try {
                    keyManager.unlock(chars)
                } catch (e: Exception) {
                    // unlock() already folds a wrong passcode into its return
                    // value, so anything thrown here is the Keystore or the
                    // stored blob being broken, not a bad guess. Say so rather
                    // than taking the app down.
                    Log.e(TAG, "unlock failed outside the passcode path", e)
                    null
                } finally {
                    Crypto.wipe(chars)
                }
            }
            busy = false
            if (outcome == null) {
                isError = true
                message = "Could not open the vault on this device."
                return@launch
            }
            when (outcome) {
                is VaultKeyManager.Unlock.Success -> onUnlocked(outcome.key)
                is VaultKeyManager.Unlock.Wrong -> {
                    isError = true
                    message = if (outcome.remaining > 0) {
                        "Incorrect. ${outcome.remaining} more before a delay."
                    } else {
                        "Incorrect."
                    }
                }
                is VaultKeyManager.Unlock.LockedOut -> {
                    isError = true
                    lockedUntil = outcome.untilEpochMillis
                    now = System.currentTimeMillis()
                    message = null
                }
                VaultKeyManager.Unlock.NotSetUp -> {
                    isError = true
                    message = "No vault on this device."
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink)
            .safeDrawingPadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(48.dp))
        Text(
            text = "FIREWALL",
            color = Chalk,
            fontSize = 24.sp,
            fontWeight = FontWeight.Black,
            fontFamily = FontFamily.Monospace,
            letterSpacing = 6.sp,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = when {
                isLockedOut -> "Locked for ${formatDuration(secondsLeft)}"
                creating && confirming == null -> "Choose a passcode"
                creating -> "Confirm your passcode"
                else -> "Enter your passcode"
            },
            color = if (isLockedOut) Danger else Muted,
            fontSize = 13.sp,
        )

        Spacer(Modifier.height(28.dp))
        Dots(count = entry.length, error = isError)
        Spacer(Modifier.height(12.dp))

        Box(modifier = Modifier.height(24.dp), contentAlignment = Alignment.Center) {
            when {
                busy -> CircularProgressIndicator(Modifier.size(18.dp), color = Accent, strokeWidth = 2.dp)
                message != null -> Text(
                    message!!,
                    color = if (isError) Danger else Muted,
                    fontSize = 12.sp,
                )
            }
        }

        Spacer(Modifier.weight(1f))

        Keypad(
            enabled = !busy && !isLockedOut,
            onDigit = {
                if (entry.length < MAX_LENGTH) {
                    entry += it
                    isError = false
                }
            },
            onBackspace = { entry = entry.dropLast(1) },
            onSubmit = ::submit,
        )

        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onGiveUp) {
            Text("Back to game", color = Muted, fontSize = 12.sp)
        }
    }
}

private fun formatDuration(seconds: Long): String = when {
    seconds >= 60 -> "${seconds / 60} min ${seconds % 60} s"
    else -> "$seconds s"
}

@Composable
private fun Dots(count: Int, error: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        repeat(MAX_LENGTH) { index ->
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(
                        when {
                            index >= count -> Panel
                            error -> Danger
                            else -> Accent
                        },
                    ),
            )
        }
    }
}

@Composable
private fun Keypad(
    enabled: Boolean,
    onDigit: (Char) -> Unit,
    onBackspace: () -> Unit,
    onSubmit: () -> Unit,
) {
    val rows = listOf("123", "456", "789")
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        rows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { digit ->
                    Key(digit.toString(), enabled, Modifier.weight(1f)) { onDigit(digit) }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Key("<", enabled, Modifier.weight(1f), onClick = onBackspace)
            Key("0", enabled, Modifier.weight(1f)) { onDigit('0') }
            Key("OK", enabled, Modifier.weight(1f), accent = true, onClick = onSubmit)
        }
    }
}

@Composable
private fun Key(
    label: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    accent: Boolean = false,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .height(58.dp)
            .fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (accent) Accent else Panel,
            contentColor = if (accent) Ink else Chalk,
            disabledContainerColor = Panel,
            disabledContentColor = Muted,
        ),
    ) {
        Text(label, fontSize = 18.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
    }
}
