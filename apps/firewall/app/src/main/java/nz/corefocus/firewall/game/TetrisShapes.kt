package nz.corefocus.firewall.game

/**
 * The tetromino cell tables, shared by the engine (collision, locking) and the
 * renderer (drawing the falling piece and the previews).
 *
 * Coordinates are offsets inside the piece's own box, x then y, y growing
 * downward. Rotation index 0 is the spawn state.
 */
object TetrisShapes {

    fun cells(piece: TetrisEngine.Piece, rotation: Int): List<Pair<Int, Int>> =
        TABLE.getValue(piece)[((rotation % 4) + 4) % 4]

    /** Box width used when drawing a piece on its own, e.g. the NEXT strip. */
    fun boxWidth(piece: TetrisEngine.Piece): Int =
        if (piece == TetrisEngine.Piece.I || piece == TetrisEngine.Piece.O) 4 else 3

    private val TABLE: Map<TetrisEngine.Piece, List<List<Pair<Int, Int>>>> = mapOf(
        TetrisEngine.Piece.I to listOf(
            listOf(0 to 1, 1 to 1, 2 to 1, 3 to 1),
            listOf(2 to 0, 2 to 1, 2 to 2, 2 to 3),
            listOf(0 to 2, 1 to 2, 2 to 2, 3 to 2),
            listOf(1 to 0, 1 to 1, 1 to 2, 1 to 3),
        ),
        TetrisEngine.Piece.J to listOf(
            listOf(0 to 0, 0 to 1, 1 to 1, 2 to 1),
            listOf(1 to 0, 2 to 0, 1 to 1, 1 to 2),
            listOf(0 to 1, 1 to 1, 2 to 1, 2 to 2),
            listOf(1 to 0, 1 to 1, 0 to 2, 1 to 2),
        ),
        TetrisEngine.Piece.L to listOf(
            listOf(2 to 0, 0 to 1, 1 to 1, 2 to 1),
            listOf(1 to 0, 1 to 1, 1 to 2, 2 to 2),
            listOf(0 to 1, 1 to 1, 2 to 1, 0 to 2),
            listOf(0 to 0, 1 to 0, 1 to 1, 1 to 2),
        ),
        TetrisEngine.Piece.O to List(4) { listOf(1 to 0, 2 to 0, 1 to 1, 2 to 1) },
        TetrisEngine.Piece.S to listOf(
            listOf(1 to 0, 2 to 0, 0 to 1, 1 to 1),
            listOf(1 to 0, 1 to 1, 2 to 1, 2 to 2),
            listOf(1 to 1, 2 to 1, 0 to 2, 1 to 2),
            listOf(0 to 0, 0 to 1, 1 to 1, 1 to 2),
        ),
        TetrisEngine.Piece.T to listOf(
            listOf(1 to 0, 0 to 1, 1 to 1, 2 to 1),
            listOf(1 to 0, 1 to 1, 2 to 1, 1 to 2),
            listOf(0 to 1, 1 to 1, 2 to 1, 1 to 2),
            listOf(1 to 0, 0 to 1, 1 to 1, 1 to 2),
        ),
        TetrisEngine.Piece.Z to listOf(
            listOf(0 to 0, 1 to 0, 1 to 1, 2 to 1),
            listOf(2 to 0, 1 to 1, 2 to 1, 1 to 2),
            listOf(0 to 1, 1 to 1, 1 to 2, 2 to 2),
            listOf(1 to 0, 0 to 1, 1 to 1, 0 to 2),
        ),
    )
}
