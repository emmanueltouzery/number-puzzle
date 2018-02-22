import { Option, instanceOf, Stream, LinkedList } from "prelude.ts";

const CELL_WIDTH_PX = 92;
const TEXT_VERTICAL_OFFSET = 55;
const FONT = "33px Arial";

function paintCell(ctx: CanvasRenderingContext2D, value: number) {
    ctx.beginPath();
    ctx.moveTo(CELL_WIDTH_PX/2, 0);
    ctx.lineTo(CELL_WIDTH_PX, CELL_WIDTH_PX/4);
    ctx.lineTo(CELL_WIDTH_PX, 3*CELL_WIDTH_PX/4);
    ctx.lineTo(CELL_WIDTH_PX/2, CELL_WIDTH_PX);
    ctx.lineTo(0, 3*CELL_WIDTH_PX/4);
    ctx.lineTo(0, CELL_WIDTH_PX/4);
    ctx.closePath();
    ctx.stroke();
    ctx.font = FONT;
    const text = value+"";
    const metrics = ctx.measureText(text);
    ctx.fillText(
        text, (CELL_WIDTH_PX-metrics.width)/2, TEXT_VERTICAL_OFFSET);
}

function drawCell(ctx: CanvasRenderingContext2D, value: number, x: number, y: number) {
    ctx.save();
    ctx.translate(CELL_WIDTH_PX*x, 3*CELL_WIDTH_PX/4*y);
    paintCell(ctx, value);
    ctx.restore();
}

// the board layout is:
//   xxx
//   xxxx
//  xxxxx
//   xxxx
//   xxx
// rows are: 3 cells, 4 cells, 5 cells, 4, cells, 3 cells.
// for the columns, we base the coordinates on the central
// 5-cells row. its left is x 0.
// for the y, we start on the top row.
// we have fractional coordinates.
// the first row starts are (x,y) 1,0
// second row: (0.5, 1)
// third row: (0, 2), ...
const rows = LinkedList.of(
    { x: 1, y: 0, items: 3},
    { x: 0.5, y: 1, items: 4},
    { x: 0, y: 2, items: 5},
    { x: 0.5, y: 3, items: 4},
    { x: 1, y: 4, items: 3}
);

window.onload = () => {
    const ctx = Option.ofNullable(document.getElementById("myCanvas"))
        .filter(instanceOf(HTMLCanvasElement))
        .flatMap(elt => Option.ofNullable(elt.getContext("2d")))
        .getOrThrow("Cannot find the ctx element!");
    const cellCount = rows.sumOn(cur=>cur.items);
    let values = Stream.iterate(1, i=>i+1).take(cellCount).shuffle();

    for (const row of rows) {
        for (let i=0; i<row.items;i++) {
            drawCell(ctx, values.head().getOrThrow(), row.x+i, row.y);
            values = values.tail().getOrThrow();
        }
    }
};
