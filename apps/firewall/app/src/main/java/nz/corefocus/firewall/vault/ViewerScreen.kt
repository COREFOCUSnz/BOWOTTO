package nz.corefocus.firewall.vault

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import nz.corefocus.firewall.ui.Accent
import nz.corefocus.firewall.ui.Chalk
import nz.corefocus.firewall.ui.Danger
import nz.corefocus.firewall.ui.Ink
import nz.corefocus.firewall.ui.Muted

/**
 * Full-screen view of one vault item, with pinch to zoom.
 *
 * The decrypted bitmap is deliberately local to this composable and recycled
 * on the way out: a full-size plaintext frame is the most sensitive thing the
 * app ever holds, and it should not sit in the heap while the owner goes back
 * to browsing the grid.
 */
@Composable
fun ViewerScreen(
    repository: VaultRepository,
    entry: VaultRepository.Entry,
    onClose: () -> Unit,
    onDelete: () -> Unit,
) {
    var bitmap by remember(entry.id) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var scale by remember(entry.id) { mutableFloatStateOf(1f) }
    var offsetX by remember(entry.id) { mutableFloatStateOf(0f) }
    var offsetY by remember(entry.id) { mutableFloatStateOf(0f) }

    LaunchedEffect(entry.id) {
        bitmap = withContext(Dispatchers.IO) { repository.image(entry.id) }
    }

    DisposableEffect(entry.id) {
        onDispose {
            // Drop the reference rather than calling recycle(). Recycling a
            // bitmap that Compose may still hold for one more frame is the
            // classic "trying to use a recycled bitmap" crash, and a crash in a
            // privacy app is worse than a few extra milliseconds before the GC
            // takes the plaintext frame. Nothing else keeps a strong reference
            // to it, so it goes on the next collection.
            bitmap = null
        }
    }

    BackHandler { onClose() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink)
            .safeDrawingPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onClose) { Text("BACK", color = Accent, fontSize = 12.sp) }
            Spacer(Modifier.weight(1f))
            Text(
                "${entry.width} x ${entry.height}",
                color = Muted,
                fontSize = 11.sp,
            )
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onDelete) { Text("DELETE", color = Danger, fontSize = 12.sp) }
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            val current = bitmap
            if (current == null) {
                CircularProgressIndicator(color = Accent)
            } else {
                Image(
                    bitmap = current.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer(
                            scaleX = scale,
                            scaleY = scale,
                            translationX = offsetX,
                            translationY = offsetY,
                        )
                        .pointerInput(entry.id) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                scale = (scale * zoom).coerceIn(1f, 6f)
                                if (scale <= 1f) {
                                    // Snap back rather than leaving the image
                                    // parked off-centre when zoomed all the way out.
                                    offsetX = 0f
                                    offsetY = 0f
                                } else {
                                    offsetX += pan.x
                                    offsetY += pan.y
                                }
                            }
                        },
                )
            }
        }

        Text(
            entry.displayName,
            color = Muted,
            fontSize = 11.sp,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
        )
    }
}
