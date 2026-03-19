const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// one skeleton per frame
const frameSkeletons = {};
let currentFrameIndex = 0;

let hoveredPoint = null;
let draggedPoint = null;
let mode = 'create'; // 'create' or 'edit'

const pointRadius = 5;
const hoverRadius = 9;
const hitRadius = 10;

// current generated link
let currentLink = null;

function getCurrentSkeleton() {
    return frameSkeletons[currentFrameIndex] || null;
}

function ensureCurrentSkeleton() {
    if (!frameSkeletons[currentFrameIndex]) {
        frameSkeletons[currentFrameIndex] = new Skeleton();
    }
    return frameSkeletons[currentFrameIndex];
}

function drawCurrentLink() {
    if (!currentLink) return;

    const polygon = currentLink.getXYProjection();
    drawPolygon(ctx, polygon, 'rgba(255,165,0,0.25)', 'orange', 2);

    polygon.forEach(p => {
        drawPoint(ctx, p, 4, 'black');
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

    drawCurrentLink();
}

function setCurrentFrame(frameIndex) {
    currentFrameIndex = frameIndex;
    hoveredPoint = null;
    draggedPoint = null;
    currentLink = null;
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

function createLinkFromFirst4Points(diameter = 20) {
    const skeleton = getCurrentSkeleton();
    if (!skeleton || skeleton.points.length < 4) return null;

    const p0 = skeleton.points[0];
    const p1 = skeleton.points[1];
    const p2 = skeleton.points[2];
    const p3 = skeleton.points[3];

    const P0 = { x: p0.x, y: p0.y, z: p0.z ?? 0 };
    const P1 = { x: p1.x, y: p1.y, z: p1.z ?? 0 };
    const P2 = { x: p2.x, y: p2.y, z: p2.z ?? 0 };
    const P3 = { x: p3.x, y: p3.y, z: p3.z ?? 0 };

    currentLink = Link.fromFourPoints(P0, P1, P2, P3, diameter);
    redrawAll();

    return currentLink;
}

canvas.addEventListener('click', (e) => {
    if (mode !== 'create') return;

    const skeleton = ensureCurrentSkeleton();
    const x = e.clientX;
    const y = e.clientY;

    const newPoint = skeleton.addPoint(x, y, 0);

    if (skeleton.points.length > 1) {
        skeleton.addLine(
            skeleton.points[skeleton.points.length - 2],
            newPoint
        );
    }

    currentLink = null;
    redrawAll();
});

canvas.addEventListener('mousedown', (e) => {
    if (mode !== 'edit') return;
    draggedPoint = getPointAt(e.clientX, e.clientY);
});

canvas.addEventListener('mousemove', (e) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    hoveredPoint = getPointAt(mouseX, mouseY);

    if (mode === 'edit' && draggedPoint) {
        const skeleton = getCurrentSkeleton();
        if (skeleton) {
            skeleton.updatePoint(draggedPoint, mouseX, mouseY, draggedPoint.z ?? 0);
        }
        currentLink = null;
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
    mode = mode === 'create' ? 'edit' : 'create';
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
        newSkeleton.addLine(newStart, newEnd);
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
    currentLink = null;
    redrawAll();
}

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (key === 'c' && !e.repeat) {
        copyPreviousFrameSkeleton();
    }

    if (key === 'w' && !e.repeat) {
        createLinkFromFirst4Points(40);
    }
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    redrawAll();
});

window.appActions = {
    toggleMode,
    getMode,
    setCurrentFrame,
    getCurrentSkeleton,
    ensureCurrentSkeleton,
    redrawAll,
    createLinkFromFirst4Points
};