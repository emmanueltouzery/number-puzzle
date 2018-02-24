import { Option, instanceOf, Vector, Stream, TypeGuard } from "prelude.ts";

const CELL_WIDTH_PX = 92;
const TEXT_VERTICAL_OFFSET = 55;
const HINTS_SPACING_X = 10;
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
    { x: 1, items: 3},
    { x: 0.5, items: 4},
    { x: 0, items: 5},
    { x: 0.5, items: 4},
    { x: 1, items: 3}
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

let appState = {
    // initialize with items at random positions on the board
    tilePositions: Stream.iterate(0,i=>i+1)
        .take(cellCount).shuffle()
        .map<TilePosition>(x => ({kind:"in_board",cellIdx:x})).toVector(),
    boardPolygons: <Polygon[]>[],
    tilePolygons: <Polygon[]>[],
    selectedPolygon: <number|undefined>undefined
};

function cellIdxGetRowCol(cellIdx: number): [number,number] {
    const rowsBefore = rowsStartItemIdx.takeWhile(startIdx => startIdx <= cellIdx);
    return [rowsBefore.length()-1, cellIdx-rowsBefore.last().getOrThrow()];
}

function drawTile(ctx: CanvasRenderingContext2D,
                    value: number|undefined, isSelected: boolean, x: number, y: number): Polygon {
    let polygon:Point[] = [];
    ctx.save();
    ctx.translate(x, y);
    const translate = (inputX:number,inputY:number) =>
        ({x: inputX+x, y: inputY+y});

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

    ctx.fillStyle = isSelected ? "red" : "white";
    ctx.fill();
    ctx.fillStyle = "black";

    if (value !== undefined) {
        const text = value+"";
        const metrics = ctx.measureText(text);
        ctx.fillText(
            text, (CELL_WIDTH_PX-metrics.width)/2, TEXT_VERTICAL_OFFSET);
    }

    ctx.restore();
    return polygon;
}

function drawTileInBoard(ctx: CanvasRenderingContext2D,
                         value: number|undefined, isSelected: boolean, x: number, y: number): Polygon {
    const xOffset = CELL_WIDTH_PX*x;
    const yOffset = 3*CELL_WIDTH_PX/4*y;
    return drawTile(ctx, value, isSelected, xOffset, yOffset);
}

function draw(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, options?: {skipTile: number}): {boardPolygons:Polygon[], tilePolygons:Polygon[]} {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const boardPolygons = drawBoard(ctx, options);
    return {boardPolygons, tilePolygons: drawTiles(ctx, options)};
}

function drawRowTotal(ctx: CanvasRenderingContext2D, rowIdx: number,
                      row: {x:number,items:number}, options?: {skipTile:number}): number {
    const rowTotal = appState.tilePositions
        .zipWithIndex()
        .filter(tileWithIndex => options ? options.skipTile !== tileWithIndex[1] : true)
        .filter(<TypeGuard<[InBoardPosition,number]>>(p => p[0].kind === "in_board"))
        .filter(p => cellIdxGetRowCol(p[0].cellIdx)[0] === rowIdx)
        .sumOn(p => p[1]+1);
    ctx.fillStyle = rowTotal === 38 ? "green" : (rowTotal > 38 ? "red" : "orange");
    ctx.fillText(rowTotal+"",
                 (row.x+row.items)*CELL_WIDTH_PX+HINTS_SPACING_X,
                 rowIdx*(CELL_WIDTH_PX*3/4)+TEXT_VERTICAL_OFFSET);
    return rowTotal;
}

function drawBoard(ctx: CanvasRenderingContext2D, options?: {skipTile: number}): Polygon[] {
    let polygons = [];
    let rowIdx = 0;
    let isWin = true;
    for (const row of rows) {
        for (let i=0;i<row.items;i++) {
            polygons.push(drawTileInBoard(
                ctx, undefined,
                false, row.x+i, rowIdx));
        }
        if (drawRowTotal(ctx, rowIdx, row, options) !== 38) {
            isWin = false;
        }
        ++rowIdx;
    }
    if (isWin) {
        alert("Bravo!");
    }
    return polygons;
}

function drawTiles(ctx: CanvasRenderingContext2D, options?: {skipTile: number}): Polygon[] {
    let polygons = [];
    for (let tileIdx=0; tileIdx<appState.tilePositions.length(); tileIdx++) {
        if (options && tileIdx === options.skipTile) {
            continue;
        }
        const tile = appState.tilePositions.get(tileIdx).getOrThrow();
        if (tile.kind === "in_board") {
            const [rowIdx,colIdx] = cellIdxGetRowCol(tile.cellIdx);
            const row = rows.get(rowIdx).getOrThrow();
            polygons.push(
                drawTileInBoard(ctx, tileIdx+1,
                           appState.selectedPolygon===tileIdx, row.x+colIdx, rowIdx));
        } else {
            polygons.push(
                drawTile(ctx, tileIdx+1,
                           appState.selectedPolygon===tileIdx, tile.pos.x, tile.pos.y));
        }
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

function getSelected(polygons: Polygon[], x:number, y:number): number|undefined {
    for (let i=0;i<polygons.length;i++) {
        if (isInConvexPolygon({x,y}, polygons[i])) {
            return i;
        }
    }
    return undefined;
}

function onMouseDown(backBuffer: HTMLCanvasElement, backBufCtx: CanvasRenderingContext2D,
                     canvas: HTMLCanvasElement, event: MouseEvent) {
    const x = event.pageX - canvas.offsetLeft;
    const y = event.pageY - canvas.offsetTop;
    appState.selectedPolygon = getSelected(appState.tilePolygons, x, y);
    if (appState.selectedPolygon !== undefined) {
    // repaint the backbuffer without the selected tile
    // since we'll paint it following the mouse movements
        draw(backBuffer, backBufCtx, {skipTile: appState.selectedPolygon});
    }
}

function onMove(backBuffer: HTMLCanvasElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, event: MouseEvent) {
    if (appState.selectedPolygon === undefined) {
        return;
    }
    const x = event.pageX - canvas.offsetLeft;
    const y = event.pageY - canvas.offsetTop;
    ctx.drawImage(backBuffer, 0, 0);
    drawTile(ctx, appState.selectedPolygon+1, false, x-CELL_WIDTH_PX/2, y-CELL_WIDTH_PX/2);
}

function onClick(backBuffer: HTMLCanvasElement, backBufCtx: CanvasRenderingContext2D,
                 canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, event: MouseEvent) {
    const x = event.pageX - canvas.offsetLeft;
    const y = event.pageY - canvas.offsetTop;
    const wasSelected = appState.selectedPolygon;
    appState.selectedPolygon = getSelected(appState.tilePolygons, x, y);
    const clickedBoardCell = appState.selectedPolygon !== undefined ? undefined :
        getSelected(appState.boardPolygons, x, y);
    if (wasSelected !== undefined && (wasSelected === appState.selectedPolygon)) {
        // user clicked on the selected polygon, unselect it.
        appState.selectedPolygon = undefined;
    } else if (wasSelected !== undefined && clickedBoardCell !== undefined) {
        // user moved a tile on an empty board cell. move the tile there.
        const newBoard =  appState.tilePositions
            .replace(wasSelected,
                     { kind: "in_board",
                       cellIdx: clickedBoardCell});
        appState.tilePositions = newBoard;
    } else if (wasSelected !== undefined && appState.selectedPolygon === undefined) {
        // user wanted to move the selected polygon to another spot
        const newBoard =  appState.tilePositions
            .replace(wasSelected,
                     { kind: "out_of_board",
                       pos: {x:x-CELL_WIDTH_PX/2,y:y-CELL_WIDTH_PX/2}});
        appState.tilePositions = newBoard;
    } else if (wasSelected !== undefined && appState.selectedPolygon !== undefined) {
        // user clicked on another tile tile. switch them
        const myPos = appState.tilePositions.get(wasSelected).getOrThrow();
        const hisPos = appState.tilePositions.get(appState.selectedPolygon).getOrThrow();
        const newBoard = appState.tilePositions
            .replace(wasSelected, hisPos)
            .replace(appState.selectedPolygon, myPos);
        appState.tilePositions = newBoard;
        appState.selectedPolygon = undefined;
    }
    appState.tilePolygons = draw(backBuffer, backBufCtx).tilePolygons;
    ctx.drawImage(backBuffer, 0, 0);
}

window.onload = () => {
    const canvas = Option.ofNullable(document.getElementById("myCanvas"))
        .filter(instanceOf(HTMLCanvasElement))
        .getOrThrow("Cannot find the canvas element!");

    const backBuffer = document.createElement("canvas");
    backBuffer.width = canvas.width;
    backBuffer.height = canvas.height;
    const backBufCtx = Option.ofNullable(backBuffer.getContext("2d"))
        .getOrThrow("Can't get the 2d context for the backbuffer canvas!");

    const ctx = Option.ofNullable(canvas.getContext("2d"))
        .getOrThrow("Can't get the 2d context for the canvas!");
    ctx.font = FONT;
    backBufCtx.font = FONT;

    let mouseDown = false;
    canvas.addEventListener('mousedown', evt => {
        mouseDown = true; onMouseDown(backBuffer, backBufCtx, canvas, evt)}, false);
    canvas.addEventListener('mousemove', evt => {
        if (mouseDown) {onMove(backBuffer, canvas, ctx, evt)} }, false);
    canvas.addEventListener('mouseup', evt => {
        mouseDown = false; onClick(backBuffer, backBufCtx, canvas, ctx, evt);}, false);

    const polygons = draw(backBuffer, backBufCtx);
    ctx.drawImage(backBuffer, 0, 0);
    appState.boardPolygons = polygons.boardPolygons;
    appState.tilePolygons = polygons.tilePolygons;
};
