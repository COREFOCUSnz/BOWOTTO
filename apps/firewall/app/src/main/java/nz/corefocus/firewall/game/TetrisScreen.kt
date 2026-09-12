package nz.corefocus.firewall.game

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import nz.corefocus.firewall.ui.Accent
import nz.corefocus.firewall.ui.Chalk
import nz.corefocus.firewall.ui.Ink
import nz.corefocus.firewall.ui.Muted
import nz.corefocus.firewall.ui.Panel
import nz.corefocus.firewall.ui.PanelEdge
import nz.corefocus.firewall.ui.PieceColours
import kotlin.math.abs

/**
 * The game. It is also the front door: [onSecretItem] fires when the player
 * long-presses the small gold chip under the stats column.
 *
 * Long-press rather than a tap, because a tap gets hit by accident, and an
 * accidental hit puts a PIN pad on screen in front of whoever is holding the
 * phone - which is the one thing this app exists to avoid.
 */
@Composable
fun TetrisScreen(onSecretItem: () -> Unit) {
    val engine = remember { TetrisEngine() }
    var snapshot by remember { mutableStateOf(engine.snapshot()) }

    fun refresh() {
        snapshot = engine.snapshot()
    }

    LaunchedEffect(snapshot.level, snapshot.isOver) {
        while (!engine.isOver) {
            delay(engine.dropIntervalMillis)
            engine.tick()
            refresh()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(
            text = "BLOCKFALL",
            color = Chalk,
            fontSize = 22.sp,
            fontWeight = FontWeight.Black,
            fontFamily = FontFamily.Monospace,
            letterSpacing = 4.sp,
        )
        Spacer(Modifier.height(10.dp))

        Row(modifier = Modifier.weight(1f)) {
            Well(
                snapshot = snapshot,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        // Swipe controls on the well itself, so the buttons are
                        // optional rather than the only way to play.
                        var dragX = 0f
                        var dragY = 0f
                        detectDragGestures(
                            onDragStart = { dragX = 0f; dragY = 0f },
                            onDragEnd = {
                                if (dragY > SWIPE_THRESHOLD && abs(dragY) > abs(dragX)) {
                                    engine.hardDrop()
                                    refresh()
                                }
                            },
                        ) { change, drag ->
                            change.consume()
                            dragX += drag.x
                            dragY += drag.y
                            while (abs(dragX) >= STEP_THRESHOLD) {
                                if (dragX > 0) engine.moveRight() else engine.moveLeft()
                                dragX -= STEP_THRESHOLD * if (dragX > 0) 1 else -1
                                refresh()
                            }
                        }
                    }
                    .pointerInput(Unit) {
                        detectTapGestures {
                            engine.rotateClockwise()
                            refresh()
                        }
                    },
            )

            Spacer(Modifier.width(12.dp))

            Column(
                modifier = Modifier.width(92.dp),
                horizontalAlignment = Alignment.Start,
            ) {
                Stat("SCORE", snapshot.score.toString())
                Stat("LINES", snapshot.lines.toString())
                Stat("LEVEL", snapshot.level.toString())
                Spacer(Modifier.height(8.dp))
                Text("NEXT", color = Muted, fontSize = 10.sp, letterSpacing = 2.sp)
                Spacer(Modifier.height(4.dp))
                snapshot.next.forEach { PiecePreview(it) }
                Spacer(Modifier.height(8.dp))
                Text("HOLD", color = Muted, fontSize = 10.sp, letterSpacing = 2.sp)
                Spacer(Modifier.height(4.dp))
                snapshot.held?.let { PiecePreview(it) }

                Spacer(Modifier.weight(1f))
                SecretChip(onSecretItem)
            }
        }

        Spacer(Modifier.height(12.dp))

        if (snapshot.isOver) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("GAME OVER", color = Accent, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                Button(
                    onClick = { engine.reset(); refresh() },
                    colors = ButtonDefaults.buttonColors(containerColor = PanelEdge),
                ) { Text("NEW GAME", color = Chalk) }
            }
        } else {
            Controls(
                onLeft = { engine.moveLeft(); refresh() },
                onRight = { engine.moveRight(); refresh() },
                onRotate = { engine.rotateClockwise(); refresh() },
                onSoftDrop = { engine.softDrop(); refresh() },
                onHardDrop = { engine.hardDrop(); refresh() },
                onHold = { engine.hold(); refresh() },
            )
        }
    }
}

/**
 * The way in. Visually it is part of the branding block under the stats - an
 * unlabelled gold square, the sort of thing a game puts in a corner. It has no
 * ripple and no content description, so neither a curious housemate nor a
 * screen reader announces it as a control.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SecretChip(onTrigger: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(14.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(Color(0xFFC8A43C))
                .combinedClickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                    onLongClick = onTrigger,
                ),
        )
        Spacer(Modifier.width(6.dp))
        Text("v1.0", color = Muted, fontSize = 9.sp)
    }
}

@Composable
private fun Stat(label: String, value: String) {
    Text(label, color = Muted, fontSize = 10.sp, letterSpacing = 2.sp)
    Text(
        value,
        color = Chalk,
        fontSize = 18.sp,
        fontWeight = FontWeight.Bold,
        fontFamily = FontFamily.Monospace,
    )
    Spacer(Modifier.height(6.dp))
}

@Composable
private fun PiecePreview(piece: TetrisEngine.Piece) {
    androidx.compose.foundation.Canvas(
        modifier = Modifier
            .padding(bottom = 4.dp)
            .size(width = 56.dp, height = 24.dp)
            .background(Panel, RoundedCornerShape(3.dp)),
    ) {
        val cells = TetrisShapes.cells(piece, 0)
        val boxWidth = TetrisShapes.boxWidth(piece)
        // Trim the empty rows out of the spawn box so a flat piece sits centred
        // in the strip instead of clinging to the top of its bounding box.
        val minY = cells.minOf { it.second }
        val boxHeight = cells.maxOf { it.second } - minY + 1

        val cell = minOf(size.width / (boxWidth + 1), size.height / (boxHeight + 1))
        val originX = (size.width - cell * boxWidth) / 2f
        val originY = (size.height - cell * boxHeight) / 2f

        cells.forEach { (x, y) ->
            drawCell(originX, originY, cell, x, y - minY, PieceColours[piece.ordinal + 1])
        }
    }
}

@Composable
private fun Well(snapshot: TetrisEngine.Snapshot, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(Panel, RoundedCornerShape(6.dp))
            .border(1.dp, PanelEdge, RoundedCornerShape(6.dp))
            .padding(4.dp),
    ) {
        androidx.compose.foundation.Canvas(
            modifier = Modifier
                .fillMaxSize()
                .aspectRatio(TetrisEngine.WIDTH.toFloat() / TetrisEngine.HEIGHT, matchHeightConstraintsFirst = true)
                .align(Alignment.Center),
        ) {
            val cell = minOf(size.width / TetrisEngine.WIDTH, size.height / TetrisEngine.HEIGHT)
            val originX = (size.width - cell * TetrisEngine.WIDTH) / 2f
            val originY = (size.height - cell * TetrisEngine.HEIGHT) / 2f

            for (y in 0 until TetrisEngine.HEIGHT) {
                for (x in 0 until TetrisEngine.WIDTH) {
                    val value = snapshot.cells[y * TetrisEngine.WIDTH + x]
                    drawCell(originX, originY, cell, x, y, if (value == 0) EMPTY else PieceColours[value])
                }
            }

            snapshot.active?.let { active ->
                // Ghost first, so the live piece paints over it where they meet.
                val ghost = active.copy(y = snapshot.ghostY)
                cellsFor(ghost).forEach { (x, y) ->
                    if (y >= 0) drawCell(originX, originY, cell, x, y, PieceColours[active.piece.ordinal + 1].copy(alpha = 0.18f))
                }
                cellsFor(active).forEach { (x, y) ->
                    if (y >= 0) drawCell(originX, originY, cell, x, y, PieceColours[active.piece.ordinal + 1])
                }
            }
        }
    }
}

private val EMPTY = Color(0xFF161D28)

private fun DrawScope.drawCell(originX: Float, originY: Float, cell: Float, x: Int, y: Int, colour: Color) {
    val inset = cell * 0.06f
    drawRect(
        color = colour,
        topLeft = Offset(originX + x * cell + inset, originY + y * cell + inset),
        size = Size(cell - inset * 2, cell - inset * 2),
    )
}

/** Board-space cells of a falling piece, for drawing it and its ghost. */
private fun cellsFor(active: TetrisEngine.Active): List<Pair<Int, Int>> =
    TetrisShapes.cells(active.piece, active.rotation).map { (dx, dy) -> active.x + dx to active.y + dy }

@Composable
private fun Controls(
    onLeft: () -> Unit,
    onRight: () -> Unit,
    onRotate: () -> Unit,
    onSoftDrop: () -> Unit,
    onHardDrop: () -> Unit,
    onHold: () -> Unit,
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Pad("HOLD", Modifier.weight(1f), onHold)
            Pad("ROTATE", Modifier.weight(1f), onRotate)
            Pad("DROP", Modifier.weight(1f), onHardDrop)
        }
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Pad("<", Modifier.weight(1f), onLeft)
            Pad("v", Modifier.weight(1f), onSoftDrop)
            Pad(">", Modifier.weight(1f), onRight)
        }
    }
}

@Composable
private fun Pad(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = modifier.height(54.dp),
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Panel, contentColor = Chalk),
    ) {
        Text(
            label,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

private const val SWIPE_THRESHOLD = 90f
private const val STEP_THRESHOLD = 48f
