import { Option, instanceOf } from "prelude.ts";

const CELL_WIDTH_PX = 92;
const TEXT_VERTICAL_OFFSET = 55;
const FONT = "33px Arial";

function drawCell(canvas: CanvasRenderingContext2D, value: number) {
    canvas.beginPath();
    canvas.moveTo(CELL_WIDTH_PX/2, 0);
    canvas.lineTo(CELL_WIDTH_PX, CELL_WIDTH_PX/4);
    canvas.lineTo(CELL_WIDTH_PX, 3*CELL_WIDTH_PX/4);
    canvas.lineTo(CELL_WIDTH_PX/2, CELL_WIDTH_PX);
    canvas.lineTo(0, 3*CELL_WIDTH_PX/4);
    canvas.lineTo(0, CELL_WIDTH_PX/4);
    canvas.closePath();
    canvas.stroke();
    canvas.font = FONT;
    const text = value+"";
    const metrics = canvas.measureText(text);
    canvas.fillText(
        text, (CELL_WIDTH_PX-metrics.width)/2, TEXT_VERTICAL_OFFSET);
}

window.onload = () => {
    const canvas = Option.ofNullable(document.getElementById("myCanvas"))
        .filter(instanceOf(HTMLCanvasElement))
        .flatMap(elt => Option.ofNullable(elt.getContext("2d")))
        .getOrThrow("Cannot find the canvas element!");
    drawCell(canvas, 6);
};
