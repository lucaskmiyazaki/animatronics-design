const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvas-container') || canvas.parentElement;

function resizeCanvas() {
    if (canvasContainer) {
        canvas.width = canvasContainer.clientWidth;
        canvas.height = canvasContainer.clientHeight;
    } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}

resizeCanvas();

// one skeleton per frame
const frameSkeletons = {};
let currentFrameIndex = 0;

let hoveredPoint = null;
let draggedPoint = null;
let mode = 'create'; // 'create' | 'edit' | 'move'

const pointRadius = 5;
const hoverRadius = 9;
const hitRadius = 10;

// z-drag state
let dragStartMouse = null;
let dragStartPoint = null;
let isZDragging = false;
const zDragScale = 1.0;

// current generated chain
const chain = new Chain();

function getCurrentSkeleton() {
    return frameSkeletons[currentFrameIndex] || null;
}

function ensureCurrentSkeleton() {
    if (!frameSkeletons[currentFrameIndex]) {
        frameSkeletons[currentFrameIndex] = new Skeleton();
    }
    return frameSkeletons[currentFrameIndex];
}

function drawCurrentChain() {
    chain.getLinks().forEach(link => {
        const polygon = link.getXYProjection();
        drawPolygon(ctx, polygon, 'rgba(255,165,0,0.25)', 'orange', 2);

        polygon.forEach(p => {
            drawPoint(ctx, p, 4, 'black');
        });
    });
}

function drawZLabel() {
    if (!draggedPoint || !isZDragging) return;

    const label = `z=${(draggedPoint.z ?? 0).toFixed(1)}`;
    const x = draggedPoint.x + 12;
    const y = draggedPoint.y - 12;

    ctx.font = '14px Arial';
    const paddingX = 6;
    const textWidth = ctx.measureText(label).width;
    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = 20;

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x, y - boxHeight + 4, boxWidth, boxHeight);

    ctx.fillStyle = 'white';
    ctx.fillText(label, x + paddingX, y);
}

function redrawAll() {
    clearCanvas(ctx, canvas);

    drawSkeleton(
        ctx,
        getCurrentSkeleton(),
        hoveredPoint,
        pointRadius,
        hoverRadius
    );

    drawCurrentChain();
    drawZLabel();
}

function drawSkeleton3D() {
    if (window.skeleton3DView) {
        window.skeleton3DView.drawSkeleton(getCurrentSkeleton());
    }
}

function drawChain3D() {
    if (window.chain3DView) {
        window.chain3DView.drawChain(chain);
    }
}

function setCurrentFrame(frameIndex) {
    currentFrameIndex = frameIndex;
    hoveredPoint = null;
    draggedPoint = null;
    dragStartMouse = null;
    dragStartPoint = null;
    isZDragging = false;
    chain.clear();
    redrawAll();
}

function getPointAt(x, y) {
    const skeleton = getCurrentSkeleton();
    if (!skeleton) return null;

    for (const point of skeleton.points) {
        const dx = x - point.x;
        const dy = y - point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= hitRadius) {
            return point;
        }
    }

    return null;
}

function getCanvasMousePosition(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function createChainFromSkeleton(diameter = 20) {
    const skeleton = getCurrentSkeleton();
    if (!skeleton || skeleton.points.length < 2) return [];

    chain.buildFromSkeleton(skeleton, diameter);
    redrawAll();

    return chain.getLinks();
}

canvas.addEventListener('click', (e) => {
    if (mode !== 'create') return;

    const skeleton = ensureCurrentSkeleton();
    const { x, y } = getCanvasMousePosition(e);

    const newPoint = skeleton.addPoint(x, y, 0);

    if (skeleton.points.length > 1) {
        skeleton.addLine(
            skeleton.points[skeleton.points.length - 2],
            newPoint
        );
    }

    chain.clear();
    redrawAll();
});

canvas.addEventListener('mousedown', (e) => {
    if (mode !== 'edit' && mode !== 'move') return;

    const { x, y } = getCanvasMousePosition(e);
    draggedPoint = getPointAt(x, y);

    if (draggedPoint) {
        dragStartMouse = { x, y };
        dragStartPoint = {
            x: draggedPoint.x,
            y: draggedPoint.y,
            z: draggedPoint.z ?? 0
        };
        isZDragging = !!e.shiftKey;
    }
});

canvas.addEventListener('mousemove', (e) => {
    const { x: mouseX, y: mouseY } = getCanvasMousePosition(e);

    hoveredPoint = getPointAt(mouseX, mouseY);

    if (draggedPoint) {
        const skeleton = getCurrentSkeleton();

        if (skeleton) {
            isZDragging = !!e.shiftKey && !!dragStartMouse && !!dragStartPoint;

            if (mode === 'edit') {
                if (isZDragging) {
                    const dy = mouseY - dragStartMouse.y;
                    const targetZ = dragStartPoint.z - dy * zDragScale;

                    skeleton.updatePoint(
                        draggedPoint,
                        dragStartPoint.x,
                        dragStartPoint.y,
                        targetZ
                    );
                } else {
                    skeleton.updatePoint(
                        draggedPoint,
                        mouseX,
                        mouseY,
                        draggedPoint.z ?? 0
                    );
                }

                chain.clear();
            } else if (mode === 'move') {
                if (isZDragging) {
                    const dy = mouseY - dragStartMouse.y;
                    const targetZ = dragStartPoint.z - dy * zDragScale;

                    skeleton.movePoint(
                        draggedPoint,
                        dragStartPoint.x,
                        dragStartPoint.y,
                        targetZ
                    );
                } else {
                    skeleton.movePointXYLockedZ(
                        draggedPoint,
                        mouseX,
                        mouseY,
                        dragStartPoint ? dragStartPoint.z : (draggedPoint.z ?? 0)
                    );
                }

                chain.clear();
            }
        }
    }

    redrawAll();
});

canvas.addEventListener('mouseup', () => {
    draggedPoint = null;
    dragStartMouse = null;
    dragStartPoint = null;
    isZDragging = false;
});

canvas.addEventListener('mouseleave', () => {
    hoveredPoint = null;
    draggedPoint = null;
    dragStartMouse = null;
    dragStartPoint = null;
    isZDragging = false;
    redrawAll();
});

function toggleMode() {
    if (mode === 'create') mode = 'edit';
    else if (mode === 'edit') mode = 'move';
    else mode = 'create';

    draggedPoint = null;
    dragStartMouse = null;
    dragStartPoint = null;
    isZDragging = false;
    return mode;
}

function getMode() {
    return mode;
}

function cloneSkeleton(sourceSkeleton) {
    if (!sourceSkeleton) return null;

    const newSkeleton = new Skeleton();
    const pointMap = new Map();

    sourceSkeleton.points.forEach(oldPoint => {
        const newPoint = newSkeleton.addPoint(
            oldPoint.x,
            oldPoint.y,
            oldPoint.z ?? 0
        );
        pointMap.set(oldPoint, newPoint);
    });

    sourceSkeleton.lines.forEach(oldLine => {
        const newStart = pointMap.get(oldLine.start);
        const newEnd = pointMap.get(oldLine.end);
        const newLine = newSkeleton.addLine(newStart, newEnd);
        newLine.length = oldLine.length;
        newLine.originalLength = oldLine.originalLength;
    });

    newSkeleton.updateAllGeometry();
    return newSkeleton;
}

function copyPreviousFrameSkeleton() {
    if (currentFrameIndex <= 0) return;

    const previousSkeleton = frameSkeletons[currentFrameIndex - 1];
    if (!previousSkeleton) return;

    frameSkeletons[currentFrameIndex] = cloneSkeleton(previousSkeleton);

    hoveredPoint = null;
    draggedPoint = null;
    dragStartMouse = null;
    dragStartPoint = null;
    isZDragging = false;
    chain.clear();
    redrawAll();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift' && draggedPoint && (mode === 'edit' || mode === 'move')) {
        isZDragging = true;
        redrawAll();
    }

    if (e.key.toLowerCase() === 'w' && !e.repeat) {
        createChainFromSkeleton(40);
        drawChain3D(true);
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
        isZDragging = false;
        redrawAll();
    }
});

window.addEventListener('resize', () => {
    resizeCanvas();
    redrawAll();
});

window.appActions = {
    toggleMode,
    getMode,
    setCurrentFrame,
    getCurrentSkeleton,
    ensureCurrentSkeleton,
    redrawAll,
    createChainFromSkeleton,
    copyPreviousFrameSkeleton,
    drawSkeleton3D,
    drawChain3D
};