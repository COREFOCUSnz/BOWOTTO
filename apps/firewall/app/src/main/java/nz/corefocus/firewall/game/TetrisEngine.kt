package nz.corefocus.firewall.game

import kotlin.math.max
import kotlin.math.pow
import kotlin.random.Random

/**
 * The decoy, and a real game - it has to be, because a game that is obviously
 * a shell is a sign saying "there is something behind this".
 *
 * Pure Kotlin with an injectable [random], so the whole thing is unit testable
 * off-device. It knows nothing about the vault.
 */
class TetrisEngine(
    private val random: Random = Random.Default,
) {

    enum class Piece { I, J, L, O, S, T, Z }

    data class Active(val piece: Piece, val rotation: Int, val x: Int, val y: Int)

    data class Snapshot(
        val cells: List<Int>,
        val active: Active?,
        val ghostY: Int,
        val next: List<Piece>,
        val held: Piece?,
        val score: Int,
        val lines: Int,
        val level: Int,
        val isOver: Boolean,
    )

    var score: Int = 0
        private set
    var lines: Int = 0
        private set
    var isOver: Boolean = false
        private set
    var held: Piece? = null
        private set

    val level: Int get() = 1 + lines / LINES_PER_LEVEL

    /** Milliseconds per gravity step, from the standard guideline curve. */
    val dropIntervalMillis: Long
        get() {
            val l = (level - 1).coerceAtMost(19)
            return max(16.0, (0.8 - l * 0.007).pow(l) * 1000.0).toLong()
        }

    private val board = IntArray(WIDTH * HEIGHT)
    private val bag = ArrayDeque<Piece>()
    private val queue = ArrayDeque<Piece>()
    private var active: Active? = null
    private var holdUsedThisPiece = false

    init {
        repeat(NEXT_SHOWN + 1) { queue.addLast(drawFromBag()) }
        spawn()
    }

    fun snapshot(): Snapshot = Snapshot(
        cells = board.toList(),
        active = active,
        ghostY = active?.let { ghostFor(it).y } ?: 0,
        next = queue.take(NEXT_SHOWN),
        held = held,
        score = score,
        lines = lines,
        level = level,
        isOver = isOver,
    )

    fun moveLeft() = shift(-1)

    fun moveRight() = shift(1)

    fun rotateClockwise() = rotate(1)

    fun rotateCounterClockwise() = rotate(-1)

    /** One row down by player input. Worth a point; returns false if it landed instead. */
    fun softDrop(): Boolean {
        val current = active ?: return false
        val moved = current.copy(y = current.y + 1)
        return if (fits(moved)) {
            active = moved
            score += 1
            true
        } else {
            lockPiece()
            false
        }
    }

    fun hardDrop() {
        val current = active ?: return
        val landed = ghostFor(current)
        score += 2 * (landed.y - current.y)
        active = landed
        lockPiece()
    }

    /** Gravity. Same as a soft drop without the point. */
    fun tick() {
        val current = active ?: return
        val moved = current.copy(y = current.y + 1)
        if (fits(moved)) active = moved else lockPiece()
    }

    /**
     * Swaps the falling piece with the held one. Allowed once per piece, which
     * is what stops hold being an infinite stall.
     */
    fun hold() {
        val current = active ?: return
        if (holdUsedThisPiece) return

        val outgoing = current.piece
        val incoming = held
        if (incoming == null) {
            held = outgoing
            spawn()
        } else {
            // Straight swap rather than pushing the held piece back onto the
            // queue: going through the queue would leave it one longer after
            // every hold, and the "next" strip would drift out of step.
            val spawned = Active(incoming, rotation = 0, x = SPAWN_X, y = 0)
            if (!fits(spawned)) {
                active = null
                isOver = true
                return
            }
            held = outgoing
            active = spawned
        }
        // After spawn(), which clears the flag for what it thinks is a new piece.
        holdUsedThisPiece = true
    }

    fun reset() {
        board.fill(0)
        bag.clear()
        queue.clear()
        score = 0
        lines = 0
        isOver = false
        held = null
        holdUsedThisPiece = false
        repeat(NEXT_SHOWN + 1) { queue.addLast(drawFromBag()) }
        spawn()
    }

    // -- internals ---------------------------------------------------------

    private fun shift(dx: Int): Boolean {
        val current = active ?: return false
        val moved = current.copy(x = current.x + dx)
        if (!fits(moved)) return false
        active = moved
        return true
    }

    private fun rotate(direction: Int): Boolean {
        val current = active ?: return false
        if (current.piece == Piece.O) return true

        val rotated = current.copy(rotation = (current.rotation + direction + 4) % 4)
        // A simplified kick table. Real SRS has per-piece offsets; these five
        // nudges cover the cases a player actually notices (rotating against a
        // wall or into a tight well) without the table.
        for ((dx, dy) in KICKS) {
            val candidate = rotated.copy(x = rotated.x + dx, y = rotated.y + dy)
            if (fits(candidate)) {
                active = candidate
                return true
            }
        }
        return false
    }

    private fun spawn() {
        if (queue.isEmpty()) queue.addLast(drawFromBag())
        val piece = queue.removeFirst()
        queue.addLast(drawFromBag())

        val spawned = Active(piece, rotation = 0, x = SPAWN_X, y = 0)
        if (!fits(spawned)) {
            active = null
            isOver = true
            return
        }
        active = spawned
        holdUsedThisPiece = false
    }

    private fun lockPiece() {
        val current = active ?: return
        for ((cx, cy) in cellsOf(current)) {
            if (cy in 0 until HEIGHT && cx in 0 until WIDTH) {
                board[cy * WIDTH + cx] = current.piece.ordinal + 1
            }
        }
        active = null
        clearLines()
        if (!isOver) spawn()
    }

    private fun clearLines() {
        var cleared = 0
        var readRow = HEIGHT - 1
        var writeRow = HEIGHT - 1

        while (readRow >= 0) {
            val full = (0 until WIDTH).all { board[readRow * WIDTH + it] != 0 }
            if (full) {
                cleared++
            } else {
                if (writeRow != readRow) {
                    System.arraycopy(board, readRow * WIDTH, board, writeRow * WIDTH, WIDTH)
                }
                writeRow--
            }
            readRow--
        }
        while (writeRow >= 0) {
            java.util.Arrays.fill(board, writeRow * WIDTH, writeRow * WIDTH + WIDTH, 0)
            writeRow--
        }

        if (cleared > 0) {
            lines += cleared
            score += LINE_SCORES[cleared] * level
        }
    }

    private fun ghostFor(from: Active): Active {
        var candidate = from
        while (true) {
            val next = candidate.copy(y = candidate.y + 1)
            if (!fits(next)) return candidate
            candidate = next
        }
    }

    private fun fits(candidate: Active): Boolean =
        cellsOf(candidate).all { (x, y) ->
            // Above the top of the well is legal - that is where pieces spawn -
            // but the sides and the floor are not.
            x in 0 until WIDTH && y < HEIGHT && (y < 0 || board[y * WIDTH + x] == 0)
        }

    private fun cellsOf(state: Active): List<Pair<Int, Int>> =
        TetrisShapes.cells(state.piece, state.rotation).map { (dx, dy) ->
            state.x + dx to state.y + dy
        }

    /**
     * Seven-bag: every tetromino appears once per seven pieces. Uniform random
     * would be more "random" and much worse to play - it can withhold an I
     * piece for thirty drops.
     */
    private fun drawFromBag(): Piece {
        if (bag.isEmpty()) Piece.entries.shuffled(random).forEach(bag::addLast)
        return bag.removeFirst()
    }

    companion object {
        const val WIDTH = 10
        const val HEIGHT = 20
        const val NEXT_SHOWN = 3
        const val LINES_PER_LEVEL = 10

        private const val SPAWN_X = 3

        /** Index by number of rows cleared; multiplied by level. */
        private val LINE_SCORES = intArrayOf(0, 100, 300, 500, 800)

        private val KICKS = listOf(0 to 0, -1 to 0, 1 to 0, -2 to 0, 2 to 0, 0 to -1)

    }
}
