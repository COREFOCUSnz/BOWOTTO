package nz.corefocus.firewall.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// The game and the vault share one palette so the transition between them
// never looks like a different app booting.
val Ink = Color(0xFF07090D)
val Panel = Color(0xFF10151E)
val PanelEdge = Color(0xFF1E2836)
val Chalk = Color(0xFFE7ECF3)
val Muted = Color(0xFF7C8899)
val Accent = Color(0xFF4FC3F7)
val Danger = Color(0xFFE5736B)

/** Piece colours, indexed by TetrisEngine.Piece.ordinal + 1; index 0 is empty. */
val PieceColours = listOf(
    Color.Transparent,
    Color(0xFF4FC3F7), // I
    Color(0xFF5C7CFA), // J
    Color(0xFFFFB74D), // L
    Color(0xFFFFD54F), // O
    Color(0xFF81C784), // S
    Color(0xFFBA79D6), // T
    Color(0xFFE57373), // Z
)

@Composable
fun FirewallTheme(content: @Composable () -> Unit) {
    // Dark only, system setting ignored. A light theme would be a second set
    // of contrast decisions to get right for no gain, and a game that suddenly
    // went white would be the most conspicuous thing on the phone.
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Accent,
            onPrimary = Ink,
            background = Ink,
            onBackground = Chalk,
            surface = Panel,
            onSurface = Chalk,
            surfaceVariant = PanelEdge,
            onSurfaceVariant = Muted,
            error = Danger,
        ),
        content = content,
    )
}
