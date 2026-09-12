package nz.corefocus.firewall.vault

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import nz.corefocus.firewall.ui.Accent
import nz.corefocus.firewall.ui.Chalk
import nz.corefocus.firewall.ui.Danger
import nz.corefocus.firewall.ui.Ink
import nz.corefocus.firewall.ui.Muted
import nz.corefocus.firewall.ui.Panel

@Composable
fun VaultScreen(
    repository: VaultRepository,
    thumbnails: ThumbnailCache,
    onAddPhotos: (onFinished: () -> Unit) -> Unit,
    onLock: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var entries by remember { mutableStateOf<List<VaultRepository.Entry>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var viewing by remember { mutableStateOf<VaultRepository.Entry?>(null) }
    var pendingDelete by remember { mutableStateOf<VaultRepository.Entry?>(null) }

    fun reload() {
        scope.launch {
            // Listing decrypts one metadata section per file, so it is disk and
            // CPU work, not a directory scan. Never on the main thread.
            entries = withContext(Dispatchers.IO) { repository.list() }
            loading = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    viewing?.let { entry ->
        ViewerScreen(
            repository = repository,
            entry = entry,
            onClose = { viewing = null },
            onDelete = { pendingDelete = entry },
        )
        return
    }

    BackHandler { onLock() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink),
    ) {
        Header(count = entries.size, onLock = onLock)

        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Accent)
            }

            entries.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Nothing in here yet", color = Chalk, fontSize = 16.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Photos you add are re-encoded and encrypted.\nNothing else on the phone can see them.",
                        color = Muted,
                        fontSize = 12.sp,
                    )
                }
            }

            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 108.dp),
                modifier = Modifier.weight(1f),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(entries, key = { it.id }) { entry ->
                    Thumbnail(
                        entry = entry,
                        repository = repository,
                        cache = thumbnails,
                        onClick = { viewing = entry },
                        onLongClick = { pendingDelete = entry },
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(
                onClick = {
                    loading = true
                    onAddPhotos { reload() }
                },
                modifier = Modifier.weight(1f).height(50.dp),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Ink),
            ) {
                Text("ADD PHOTOS", fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            }
        }
    }

    pendingDelete?.let { entry ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            containerColor = Panel,
            title = { Text("Delete from vault?", color = Chalk) },
            text = {
                Text(
                    "This removes it from the vault permanently. If you already " +
                        "deleted the original from Gallery, this is the only copy.",
                    color = Muted,
                    fontSize = 13.sp,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val target = entry
                    pendingDelete = null
                    viewing = null
                    scope.launch {
                        withContext(Dispatchers.IO) { repository.delete(target.id) }
                        thumbnails.remove(target.id)
                        reload()
                    }
                }) { Text("Delete", color = Danger) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Keep", color = Muted) }
            },
        )
    }
}

@Composable
private fun Header(count: Int, onLock: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 8.dp, top = 16.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(
                "FIREWALL",
                color = Chalk,
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 4.sp,
            )
            Text(
                if (count == 1) "1 item" else "$count items",
                color = Muted,
                fontSize = 11.sp,
            )
        }
        Spacer(Modifier.weight(1f))
        TextButton(onClick = onLock) { Text("LOCK", color = Accent, fontSize = 12.sp) }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Thumbnail(
    entry: VaultRepository.Entry,
    repository: VaultRepository,
    cache: ThumbnailCache,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    var bitmap by remember(entry.id) { mutableStateOf(cache[entry.id]) }

    LaunchedEffect(entry.id) {
        if (bitmap != null) return@LaunchedEffect
        val decoded = withContext(Dispatchers.IO) { repository.thumbnail(entry.id) }
        if (decoded != null) {
            cache[entry.id] = decoded
            bitmap = decoded
        }
    }

    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(6.dp))
            .background(Panel)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick),
    ) {
        bitmap?.let {
            Image(
                bitmap = it.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }
    }
}
