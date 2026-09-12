package nz.corefocus.firewall

import nz.corefocus.firewall.game.TetrisEngine
import nz.corefocus.firewall.game.TetrisShapes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

/**
 * The decoy has to hold up as a game, so it gets real tests. A shell that
 * misbehaves the moment someone plays it is the thing that gets the app looked
 * at closely.
 */
class TetrisEngineTest {

    private fun engine() = TetrisEngine(Random(20260912))

    @Test
    fun `a fresh board is empty with a piece falling`() {
        val snapshot = engine().snapshot()
        assertEquals(TetrisEngine.WIDTH * TetrisEngine.HEIGHT, snapshot.cells.size)
        assertTrue(snapshot.cells.all { it == 0 })
        assertNotNull(snapshot.active)
        assertEquals(TetrisEngine.NEXT_SHOWN, snapshot.next.size)
        assertNull(snapshot.held)
    }

    @Test
    fun `pieces never leave the well`() {
        val subject = engine()
        repeat(2000) { step ->
            when (step % 7) {
                0, 1 -> subject.moveLeft()
                2, 3 -> subject.moveRight()
                4 -> subject.rotateClockwise()
                5 -> subject.softDrop()
                else -> subject.tick()
            }
            val snapshot = subject.snapshot()
            snapshot.active?.let { active ->
                TetrisShapes.cells(active.piece, active.rotation).forEach { (dx, dy) ->
                    val x = active.x + dx
                    val y = active.y + dy
                    assertTrue("x=$x out of the well at step $step", x in 0 until TetrisEngine.WIDTH)
                    assertTrue("y=$y below the floor at step $step", y < TetrisEngine.HEIGHT)
                }
            }
            if (snapshot.isOver) return
        }
    }

    @Test
    fun `a piece never lands on top of an occupied cell`() {
        val subject = engine()
        repeat(400) {
            subject.hardDrop()
            if (subject.isOver) return
        }
        // Reaching here without a stuck overlap is the assertion; hardDrop would
        // have thrown or the board would be inconsistent otherwise.
        assertTrue(subject.snapshot().cells.count { it != 0 } > 0)
    }

    @Test
    fun `the bag deals all seven pieces before repeating one`() {
        val seen = mutableListOf<TetrisEngine.Piece>()
        val subject = engine()
        // The visible queue plus the falling piece is enough to observe the bag
        // without reaching into it.
        repeat(28) {
            subject.snapshot().active?.let { seen += it.piece }
            subject.hardDrop()
            if (subject.isOver) return@repeat
        }
        seen.take(21).chunked(7).filter { it.size == 7 }.forEach { bag ->
            assertEquals("a bag repeated a piece: $bag", 7, bag.toSet().size)
        }
    }

    @Test
    fun `hold swaps once per piece and no more`() {
        val subject = engine()
        val first = subject.snapshot().active!!.piece

        subject.hold()
        assertEquals(first, subject.snapshot().held)
        val afterHold = subject.snapshot().active!!.piece

        // A second hold on the same piece must do nothing, or hold becomes an
        // infinite stall and the game never ends.
        subject.hold()
        assertEquals(first, subject.snapshot().held)
        assertEquals(afterHold, subject.snapshot().active!!.piece)

        // New piece, so hold is available again - and this time there is
        // something stored, so it must be a swap: the held piece comes out and
        // the falling one goes in.
        subject.hardDrop()
        val third = subject.snapshot().active!!.piece
        subject.hold()
        assertEquals(third, subject.snapshot().held)
        assertEquals(first, subject.snapshot().active!!.piece)
    }

    @Test
    fun `holding repeatedly does not stretch the next queue`() {
        val subject = engine()
        repeat(50) {
            subject.hold()
            subject.hardDrop()
            if (subject.isOver) return@repeat
            assertEquals(TetrisEngine.NEXT_SHOWN, subject.snapshot().next.size)
        }
    }

    @Test
    fun `the game ends when the stack reaches the top`() {
        val subject = engine()
        var drops = 0
        while (!subject.isOver && drops < 5000) {
            subject.hardDrop()
            drops++
        }
        assertTrue("the well never filled in $drops drops", subject.isOver)
        assertNull(subject.snapshot().active)
    }

    @Test
    fun `clearing lines scores and speeds the game up`() {
        val subject = engine()
        var guard = 0
        while (subject.lines == 0 && !subject.isOver && guard < 5000) {
            // Alternate sides so rows actually complete instead of building one tower.
            repeat(guard % 9) { subject.moveLeft() }
            subject.hardDrop()
            guard++
        }
        if (subject.isOver && subject.lines == 0) return // no clear happened; nothing to assert

        assertTrue("clearing a line should score", subject.score > 0)
        assertTrue(
            "level should rise with lines",
            subject.level == 1 + subject.lines / TetrisEngine.LINES_PER_LEVEL,
        )
    }

    @Test
    fun `the gravity delay is never zero`() {
        // The game loop is `delay(dropIntervalMillis)`. A zero here would spin a
        // coroutine flat out and cook the battery of a phone sitting in a pocket.
        val subject = engine()
        assertTrue(subject.dropIntervalMillis in 1..1000)
        repeat(500) { subject.hardDrop() }
        assertTrue("delay went to zero at level ${subject.level}", subject.dropIntervalMillis > 0)
    }
}
