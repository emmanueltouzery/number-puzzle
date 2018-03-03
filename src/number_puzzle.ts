import { Option, instanceOf, Vector, Stream, HashSet, typeGuard } from "prelude.ts";

const CELL_WIDTH_PX = 92;
const TEXT_VERTICAL_OFFSET = 55;
const HINTS_SPACING_X = 20;
const FONT = "33px Arial";
let CANVAS_PADDING_PX = 0; // will be overwritten during initialization
const WINNING_TOTAL = 38;

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
    selectedPolygon: <number|undefined>undefined,
    displayHints: new URLSearchParams(window.location.search).get("hints") === "1"
};

function cellIdxGetRowCol(cellIdx: number): [number,number] {
    const rowsBefore = rowsStartItemIdx.takeWhile(startIdx => startIdx <= cellIdx);
    return [rowsBefore.length()-1, cellIdx-rowsBefore.last().getOrThrow()];
}

function drawTile(ctx: CanvasRenderingContext2D,
                  value: number|undefined, isInWinningDiagonal: boolean,
                  x: number, y: number): Polygon {
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

    ctx.fillStyle = "white";
    ctx.fill();

    ctx.fillStyle = appState.displayHints ?
        (isInWinningDiagonal ? "blue" : "black") : "black";
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
                         value: number|undefined, isInWinningDiagonal: boolean,
                         x: number, y: number): Polygon {
    const xOffset = CELL_WIDTH_PX*x + CANVAS_PADDING_PX;
    const yOffset = 3*CELL_WIDTH_PX/4*y + CANVAS_PADDING_PX;
    return drawTile(ctx, value, isInWinningDiagonal, xOffset, yOffset);
}

function drawAndCheckForWin(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, options?: {skipTile: number}): {boardPolygons:Polygon[], tilePolygons:Polygon[]} {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const {boardPolygons,allItemsInWinningDiagonals} = drawBoardAndCheckForWin(ctx, options);
    return {boardPolygons, tilePolygons: drawTiles(ctx, allItemsInWinningDiagonals, options)};
}

const allDiagonal1Indexes = Vector.of(
    HashSet.of(7, 12, 16),
    HashSet.of(3, 8, 13, 17),
    HashSet.of(0, 4, 9, 14, 18),
    HashSet.of(1, 5, 10, 15),
    HashSet.of(2, 6, 11));

const allDiagonal2Indexes = Vector.of(
    HashSet.of(0, 3, 7),
    HashSet.of(1, 4, 8, 12),
    HashSet.of(2, 5, 9, 13, 16),
    HashSet.of(6, 10, 14, 17),
    HashSet.of(11, 15, 18));

function drawTotalCheckDisqualifiesWin(
    ctx: CanvasRenderingContext2D, rowIdx: number,
    row: {x:number,items:number}, options?: {skipTile:number}): {preventsWin:boolean,itemsInWinningDiagonals:HashSet<number>} {
    const positionsToConsider = appState.tilePositions
        .zipWithIndex()
        .filter(tileWithIndex => options ? options.skipTile !== tileWithIndex[1] : true)
        .filter(typeGuard(p => p[0].kind === "in_board", {} as [InBoardPosition,number]));

    const drawTotal = (val:number) => {
        ctx.fillStyle = val === WINNING_TOTAL ? "green" : (val > WINNING_TOTAL ? "red" : "orange");
        ctx.fillText(val+"",
                     HINTS_SPACING_X,
                     TEXT_VERTICAL_OFFSET);
    };

    let itemsInWinningDiagonals = HashSet.empty<number>();

    // horizontal totals
    const rowTotal = positionsToConsider
        .filter(p => cellIdxGetRowCol(p[0].cellIdx)[0] === rowIdx)
        .sumOn(p => p[1]+1);
    if (appState.displayHints) {
        ctx.save();
        ctx.translate((row.x+row.items)*CELL_WIDTH_PX+CANVAS_PADDING_PX,
                      rowIdx*(CELL_WIDTH_PX*3/4)+CANVAS_PADDING_PX);
        ctx.beginPath();
        ctx.moveTo(5, CELL_WIDTH_PX/2);
        ctx.lineTo(15, CELL_WIDTH_PX/2);
        ctx.stroke();
        drawTotal(rowTotal);
        ctx.restore();
    }
    if (rowTotal === WINNING_TOTAL) {
        itemsInWinningDiagonals = itemsInWinningDiagonals.addAll(
            positionsToConsider
                .filter(p => cellIdxGetRowCol(p[0].cellIdx)[0] === rowIdx)
                .map(p => p[0].cellIdx));
    }

    // top-left->bottom right totals
    const diag1indexes = allDiagonal1Indexes.get(rowIdx).getOrThrow();
    const diag1Total = positionsToConsider
        .filter(p => diag1indexes.contains(p[0].cellIdx))
        .sumOn(p => p[1]+1);
    if (appState.displayHints) {
        ctx.save();
        const [row,col] = cellIdxGetRowCol(
            allDiagonal1Indexes.get(rowIdx).getOrThrow().toArray({sortOn:x=>x})[0]);
        ctx.translate((rows.get(row).getOrThrow().x + col)*CELL_WIDTH_PX-CELL_WIDTH_PX/2+CANVAS_PADDING_PX,
                      row*(CELL_WIDTH_PX*3/4)-CELL_WIDTH_PX/2+CANVAS_PADDING_PX);
        ctx.beginPath();
        const metrics = ctx.measureText(diag1Total+"");
        ctx.moveTo(HINTS_SPACING_X+metrics.width+5, CELL_WIDTH_PX/2);
        ctx.lineTo(HINTS_SPACING_X+metrics.width+5+10, CELL_WIDTH_PX/2+10);
        ctx.stroke();
        drawTotal(diag1Total);
        ctx.restore();
    }
    if (diag1Total === WINNING_TOTAL) {
        itemsInWinningDiagonals = itemsInWinningDiagonals.addAll(
            positionsToConsider
                .filter(p => diag1indexes.contains(p[0].cellIdx))
                .map(p => p[0].cellIdx));
    }

    // top-right->bottom left totals
    const diag2indexes = allDiagonal2Indexes.get(rowIdx).getOrThrow();
    const diag2Total = positionsToConsider
        .filter(p => diag2indexes.contains(p[0].cellIdx))
        .sumOn(p => p[1]+1);
    if (appState.displayHints) {
        ctx.save();
        const [row,col] = cellIdxGetRowCol(
            allDiagonal2Indexes.get(rowIdx).getOrThrow().toArray({sortOn:x=>cellCount-x})[0]);
        ctx.translate((rows.get(row).getOrThrow().x + col)*CELL_WIDTH_PX-CELL_WIDTH_PX/2+CANVAS_PADDING_PX,
                      row*(CELL_WIDTH_PX*3/4)+CELL_WIDTH_PX/2+CANVAS_PADDING_PX);
        ctx.beginPath();
        const metrics = ctx.measureText(diag2Total+"");
        ctx.moveTo(HINTS_SPACING_X+metrics.width+5, CELL_WIDTH_PX/2);
        ctx.lineTo(HINTS_SPACING_X+metrics.width+5+10, CELL_WIDTH_PX/2-10);
        ctx.stroke();
        drawTotal(diag2Total);
        ctx.restore();
    }
    if (diag2Total === WINNING_TOTAL) {
        itemsInWinningDiagonals = itemsInWinningDiagonals.addAll(
            positionsToConsider
                .filter(p => diag2indexes.contains(p[0].cellIdx))
                .map(p => p[0].cellIdx));
    }

    const preventsWin = rowTotal !== diag1Total ||
        diag1Total !== WINNING_TOTAL ||
        diag2Total !== WINNING_TOTAL;
    return {preventsWin, itemsInWinningDiagonals};
}

function drawBoardAndCheckForWin(ctx: CanvasRenderingContext2D, options?: {skipTile: number})
: { boardPolygons: Polygon[], allItemsInWinningDiagonals:HashSet<number>} {
    let polygons = [];
    let rowIdx = 0;
    let isWin = true;
    let allItemsInWinningDiagonals = HashSet.empty<number>();
    for (const row of rows) {
        for (let i=0;i<row.items;i++) {
            polygons.push(drawTileInBoard(
                ctx, undefined,
                false, row.x+i, rowIdx));
        }
        const {preventsWin, itemsInWinningDiagonals} =
            drawTotalCheckDisqualifiesWin(ctx, rowIdx, row, options);
        allItemsInWinningDiagonals =
            allItemsInWinningDiagonals.addAll(itemsInWinningDiagonals);
        isWin = (!preventsWin) && isWin;
        ++rowIdx;
    }
    if (isWin) {
        alert("Bravo!");
    }
    return {boardPolygons:polygons,allItemsInWinningDiagonals};
}

function drawTiles(ctx: CanvasRenderingContext2D,
                   allItemsInWinningDiagonals: HashSet<number>,
                   options?: {skipTile: number}): Polygon[] {
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
                                allItemsInWinningDiagonals.contains(tile.cellIdx),
                                row.x+colIdx, rowIdx));
        } else {
            polygons.push(
                drawTile(ctx, tileIdx+1,
                           false, tile.pos.x, tile.pos.y));
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

function getOnCanvasXY(canvas: HTMLCanvasElement, event: MouseEvent|TouchEvent): [number,number] {
    const [clickX,clickY] = event instanceof MouseEvent ?
        [event.pageX, event.pageY] :
        [event.touches[0].pageX, event.touches[0].pageY];
    return [clickX - canvas.offsetLeft, clickY - canvas.offsetTop];
}

function onDown(backBuffer: HTMLCanvasElement, backBufCtx: CanvasRenderingContext2D,
                     canvas: HTMLCanvasElement, event: MouseEvent|TouchEvent) {
    const [x,y] = getOnCanvasXY(canvas, event);
    appState.selectedPolygon = getSelected(appState.tilePolygons, x, y);
    if (appState.selectedPolygon !== undefined) {
    // repaint the backbuffer without the selected tile
    // since we'll paint it following the mouse movements
        drawAndCheckForWin(backBuffer, backBufCtx, {skipTile: appState.selectedPolygon});
    }
}

function onMove(backBuffer: HTMLCanvasElement, canvas: HTMLCanvasElement,
                ctx: CanvasRenderingContext2D, event: MouseEvent|TouchEvent): [number,number] {
    const [x,y] = getOnCanvasXY(canvas, event);
    if (appState.selectedPolygon === undefined) {
        return [x,y];
    }
    ctx.drawImage(backBuffer, 0, 0);
    drawTile(ctx, appState.selectedPolygon+1, false, x-CELL_WIDTH_PX/2, y-CELL_WIDTH_PX/2);
    return [x,y];
}

function onUp(backBuffer: HTMLCanvasElement, backBufCtx: CanvasRenderingContext2D,
              ctx: CanvasRenderingContext2D, x: number, y: number) {
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
    appState.tilePolygons = drawAndCheckForWin(backBuffer, backBufCtx).tilePolygons;
    ctx.drawImage(backBuffer, 0, 0);
}

window.onload = () => {
    const canvas = Option.ofNullable(document.getElementById("myCanvas"))
        .filter(instanceOf(HTMLCanvasElement))
        .getOrThrow("Cannot find the canvas element!");

    // center the canvas horizontally
    CANVAS_PADDING_PX = (canvas.width - CELL_WIDTH_PX*5)/2;

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
    const handleDownEvt = (evt:MouseEvent|TouchEvent) => {
        mouseDown = true; onDown(backBuffer, backBufCtx, canvas, evt)};
    canvas.addEventListener('touchstart', handleDownEvt, false);
    canvas.addEventListener('mousedown', handleDownEvt, false);

    let curX:number, curY:number;

    const handleMoveEvt = (evt:MouseEvent|TouchEvent) => {
        if (mouseDown) { [curX,curY] = onMove(backBuffer, canvas, ctx, evt)}};
    canvas.addEventListener('mousemove', handleMoveEvt, false);
    canvas.addEventListener('touchmove', handleMoveEvt, false);

    const handleUpEvt = () => {
        mouseDown = false; onUp(backBuffer, backBufCtx, ctx, curX, curY);};
    canvas.addEventListener('mouseup', handleUpEvt, false);
    canvas.addEventListener('touchend', handleUpEvt, false);

    // double click to toggle hints
    canvas.addEventListener('dblclick', () => {
        appState.displayHints = !appState.displayHints;
        drawAndCheckForWin(backBuffer, backBufCtx);
        ctx.drawImage(backBuffer, 0, 0);
    });

    const polygons = drawAndCheckForWin(backBuffer, backBufCtx);
    ctx.drawImage(backBuffer, 0, 0);
    appState.boardPolygons = polygons.boardPolygons;
    appState.tilePolygons = polygons.tilePolygons;
};
