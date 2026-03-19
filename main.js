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

function getCurrentSkeleton() {
    return frameSkeletons[currentFrameIndex] || null;
}

function ensureCurrentSkeleton() {
    if (!frameSkeletons[currentFrameIndex]) {
        frameSkeletons[currentFrameIndex] = new Skeleton();
    }
    return frameSkeletons[currentFrameIndex];
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
}

function setCurrentFrame(frameIndex) {
    currentFrameIndex = frameIndex;
    hoveredPoint = null;
    draggedPoint = null;
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

canvas.addEventListener('click', (e) => {
    if (mode !== 'create') return;

    const skeleton = ensureCurrentSkeleton();
    const x = e.clientX;
    const y = e.clientY;

    const newPoint = skeleton.addPoint(x, y);

    if (skeleton.points.length > 1) {
        skeleton.addLine(
            skeleton.points[skeleton.points.length - 2],
            newPoint
        );
    }

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
            skeleton.updatePoint(draggedPoint, mouseX, mouseY);
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
        const newPoint = newSkeleton.addPoint(oldPoint.x, oldPoint.y);
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
    redrawAll();
}

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (key === 'c' && !e.repeat) {
        copyPreviousFrameSkeleton();
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
    redrawAll
};