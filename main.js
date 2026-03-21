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
}

function drawSkeleton3D() {
    if (window.skeleton3DView) {
        window.skeleton3DView.drawSkeleton(getCurrentSkeleton());
    }
}

function setCurrentFrame(frameIndex) {
    currentFrameIndex = frameIndex;
    hoveredPoint = null;
    draggedPoint = null;
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
});

canvas.addEventListener('mousemove', (e) => {
    const { x: mouseX, y: mouseY } = getCanvasMousePosition(e);

    hoveredPoint = getPointAt(mouseX, mouseY);

    if (draggedPoint) {
        const skeleton = getCurrentSkeleton();

        if (skeleton) {
            if (mode === 'edit') {
                skeleton.updatePoint(draggedPoint, mouseX, mouseY, draggedPoint.z ?? 0);
                chain.clear();
            } else if (mode === 'move') {
                skeleton.movePoint(
                    draggedPoint,
                    mouseX,
                    mouseY,
                    draggedPoint.z ?? 0
                );
                chain.clear();
            }
        }
    }

    redrawAll();
});

canvas.addEventListener('mouseup', () => {
    draggedPoint = null;
});

canvas.addEventListener('mouseleave', () => {
    hoveredPoint = null;
    draggedPoint = null;
    redrawAll();
});

function toggleMode() {
    if (mode === 'create') mode = 'edit';
    else if (mode === 'edit') mode = 'move';
    else mode = 'create';

    draggedPoint = null;
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
    chain.clear();
    redrawAll();
}

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (key === 'w' && !e.repeat) {
        drawSkeleton3D();
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
    drawSkeleton3D
};