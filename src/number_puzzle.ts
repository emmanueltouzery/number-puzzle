import { Option, instanceOf, Vector, Stream } from "prelude.ts";

const CELL_WIDTH_PX = 92;
const TEXT_VERTICAL_OFFSET = 55;
const FONT = "33px Arial";

type Point={x:number,y:number};
type Vec=[Point,Point];
type Polygon=Point[];

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
const rows = Vector.of(
    { x: 1, y: 0, items: 3}, // get rid of y?
    { x: 0.5, y: 1, items: 4},
    { x: 0, y: 2, items: 5},
    { x: 0.5, y: 3, items: 4},
    { x: 1, y: 4, items: 3}
);
const cellCount = rows.sumOn(cur=>cur.items);

// list, one item per row on the board,
// containing the start item index for that row
const rowsStartItemIdx = 
    rows.map(r=>r.items).foldLeft(
        {itemsCount:0,rows:Vector.empty<number>()},
        (sofar,cur) => ({itemsCount:sofar.itemsCount+cur,
                         rows:sofar.rows.append(sofar.itemsCount)})).rows;


interface InBoardPosition {kind:"in_board", cellIdx:number};
interface OutOfBoardPosition {kind:"out_of_board", pos:Point};
type TilePosition = InBoardPosition | OutOfBoardPosition;

interface AppState {
    boardContents: Vector<TilePosition>;
    polygons: Polygon[];
    selectedPolygon: number|undefined;
}

let appState: AppState = {
    boardContents: Stream.iterate(0,i=>i+1)
        .take(cellCount).shuffle()
        .map<TilePosition>(x => ({kind:"in_board",cellIdx:x})).toVector(),
    polygons: [],
    selectedPolygon: undefined
};

function cellIdxGetRowCol(cellIdx: number): [number,number] {
    const rowsBefore = rowsStartItemIdx.takeWhile(startIdx => startIdx <= cellIdx);
    return [rowsBefore.length()-1, cellIdx-rowsBefore.last().getOrThrow()];
}

function drawCellAt(ctx: CanvasRenderingContext2D,
                    value: number|undefined, isSelected: boolean, x: number, y: number): Polygon {
    let polygon:Point[] = [];
    ctx.save();
    const xOffset = CELL_WIDTH_PX*x;
    const yOffset = 3*CELL_WIDTH_PX/4*y;
    ctx.translate(xOffset, yOffset);
    const translate = (inputX:number,inputY:number) =>
        ({x: inputX+xOffset, y: inputY+yOffset});

    ctx.beginPath();
    ctx.moveTo(CELL_WIDTH_PX/2, 0);
    polygon.push(translate(CELL_WIDTH_PX/2, 0));

    const addPoint = (x:number,y:number) => {
        ctx.lineTo(x, y);
        polygon.push(translate(x, y));
    };

    addPoint(CELL_WIDTH_PX, CELL_WIDTH_PX/4);
    addPoint(CELL_WIDTH_PX, 3*CELL_WIDTH_PX/4);
    addPoint(CELL_WIDTH_PX/2, CELL_WIDTH_PX);
    addPoint(0, 3*CELL_WIDTH_PX/4);
    addPoint(0, CELL_WIDTH_PX/4);

    ctx.closePath();
    ctx.stroke();

    if (isSelected) {
        ctx.fill();
    }

    if (value !== undefined) {
        const text = value+"";
        const metrics = ctx.measureText(text);
        ctx.fillText(
            text, (CELL_WIDTH_PX-metrics.width)/2, TEXT_VERTICAL_OFFSET);
    }

    ctx.restore();
    return polygon;
}

function drawBoard(ctx: CanvasRenderingContext2D): Polygon[] {
    let idx = 0;
    let polygons = [];
    for (let tileIdx=0; tileIdx<appState.boardContents.length(); tileIdx++) {
        const tile = appState.boardContents.get(tileIdx).getOrThrow();
        if (tile.kind === "in_board") {
            const [rowIdx,colIdx] = cellIdxGetRowCol(tile.cellIdx);
            const row = rows.get(rowIdx).getOrThrow();
            polygons.push(
                drawCellAt(ctx, idx+1,
                           appState.selectedPolygon===idx, row.x+colIdx, rowIdx));
        } else {
            polygons.push(
                drawCellAt(ctx, idx+1,
                           appState.selectedPolygon===idx, tile.pos.x, tile.pos.y));
        }
        ++idx;
    }
    return polygons;
}

function vectorX(v: Vec): number {
    return v[1].x - v[0].x;
}

function vectorY(v: Vec): number {
    return v[1].y - v[0].y;
}

function crossProduct(v1: Vec, v2: Vec): number {
    return vectorX(v1)*vectorY(v2) - vectorY(v1)*vectorX(v2);
}

function isInConvexPolygon(testPoint: Point, polygon: Polygon): boolean {
    // https://stackoverflow.com/a/34689268/516188
    if (polygon.length < 3) {
        throw "Only supporting polygons of length at least 3";
    }
    // going through all the edges around the polygon. compute the
    // vector cross-product http://allenchou.net/2013/07/cross-product-of-2d-vectors/
    // to find out for each edge on which side of the edge is the point.
    // if the point is on the same side for all the edges, it's inside
    let initCrossIsPositive = undefined;
    for (var i=0;i<polygon.length;i++) {
        if (polygon[i].x === testPoint.x &&
            polygon[i].y === testPoint.y) {
            // testPoint is an edge of the polygon
            return true;
        }
        const curPointOnEdge = polygon[i];
        const nextPointOnEdge = polygon[(i+1)%polygon.length];
        const vector1 = <[Point,Point]>[curPointOnEdge, nextPointOnEdge];
        const vector2 = <[Point,Point]>[curPointOnEdge, testPoint];
        const cross = crossProduct(vector1, vector2);
        if (initCrossIsPositive === undefined) {
            initCrossIsPositive = cross > 0;
        } else {
            if (initCrossIsPositive !== (cross > 0)) {
                return false;
            }
        }
    }
    // all the cross-products have the same sign: we're inside
    return true;
}

function onClick(canvas: HTMLCanvasElement) {
    return (event: MouseEvent) => {
        const x = event.pageX - canvas.offsetLeft;
        const y = event.pageY - canvas.offsetTop;
        appState.selectedPolygon = undefined;
        for (let i=0;i<appState.polygons.length;i++) {
            if (isInConvexPolygon({x,y}, appState.polygons[i])) {
                appState.selectedPolygon = i;
                break;
            }
        }
        drawBoard(Option.ofNullable(canvas.getContext("2d"))
                  .getOrThrow("onClick: failed to get the canvas context"));
    };
}

window.onload = () => {
    const canvas = Option.ofNullable(document.getElementById("myCanvas"))
        .filter(instanceOf(HTMLCanvasElement))
        .getOrThrow("Cannot find the canvas element!");

    canvas.addEventListener('click', onClick(canvas), false);

    const ctx = Option.ofNullable(canvas.getContext("2d"))
        .getOrThrow("Can't get the 2d context for the canvas!");
    ctx.font = FONT;

    appState.polygons = drawBoard(ctx);
};
