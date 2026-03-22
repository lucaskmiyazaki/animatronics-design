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
let hoveredLine = null;
let draggedPoint = null;
let mode = 'create'; // 'create' | 'edit' | 'move'
// index of the currently-active branch within a Skeleton
let currentBranch = 0;

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
    // Prefer flat skeleton.points, otherwise search all branches' points
    let points = Array.isArray(skeleton.points) ? skeleton.points : [];
    if ((!points || points.length === 0) && skeleton.branches && skeleton.branches.length > 0) {
        // aggregate all branch points so we can hit-test any point
        points = [];
        for (const branch of skeleton.branches) {
            if (branch && Array.isArray(branch.points)) points.push(...branch.points);
        }
    }

    if (!points) return null;

    for (const point of points) {
        const dx = x - point.x;
        const dy = y - point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= hitRadius) {
            return point;
        }
    }

    return null;
}

// Find the branch (or skeleton) that owns a given point object
function findOwnerForPoint(point) {
    const skeleton = getCurrentSkeleton();
    if (!skeleton || !point) return null;

    if (skeleton.points && skeleton.points.includes(point)) return skeleton;

    if (skeleton.branches) {
        for (const branch of skeleton.branches) {
            if (branch && branch.points && branch.points.includes(point)) return branch;
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

// distance from point (px,py) to segment (x1,y1)-(x2,y2)
function distancePointToSegment(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const len2 = vx * vx + vy * vy;
    if (len2 < 1e-12) return Math.hypot(px - x1, py - y1);
    let t = (wx * vx + wy * vy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = x1 + vx * t;
    const cy = y1 + vy * t;
    return Math.hypot(px - cx, py - cy);
}

// project point (px,py) onto segment (x1,y1)-(x2,y2)
function projectPointToSegment(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const len2 = vx * vx + vy * vy;
    if (len2 < 1e-12) return { x: x1, y: y1 };
    const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / len2));
    return { x: x1 + vx * t, y: y1 + vy * t };
}

// returns the nearest line object (from flat skeleton or any branch) within hitRadius, otherwise null
function getLineAt(x, y) {
    const skeleton = getCurrentSkeleton();
    if (!skeleton) return null;

    let bestLine = null;
    let bestDist = Infinity;

    if (skeleton.lines) {
        for (const line of skeleton.lines) {
            const d = distancePointToSegment(x, y, line.start.x, line.start.y, line.end.x, line.end.y);
            if (d < bestDist) { bestDist = d; bestLine = line; }
        }
    }

    if (skeleton.branches) {
        for (const branch of skeleton.branches) {
            for (const line of branch.lines) {
                const d = distancePointToSegment(x, y, line.start.x, line.start.y, line.end.x, line.end.y);
                if (d < bestDist) { bestDist = d; bestLine = line; }
            }
        }
    }

    return (bestLine && bestDist <= hitRadius) ? bestLine : null;
}

function createChainFromSkeleton(diameter = 20) {
    const skeleton = getCurrentSkeleton();
    if (!skeleton) return [];

    // Use flat skeleton if available, otherwise use first branch
    let useSkeleton = skeleton;
    if ((!skeleton.points || skeleton.points.length < 2) && skeleton.branches && skeleton.branches.length > 0) {
        const idx = Math.max(0, Math.min(currentBranch, skeleton.branches.length - 1));
        useSkeleton = skeleton.branches[idx];
    }

    if (!useSkeleton.points || useSkeleton.points.length < 2) return [];

    chain.buildFromSkeleton(useSkeleton, diameter);
    redrawAll();

    return chain.getLinks();
}

canvas.addEventListener('click', (e) => {
    const skeleton = ensureCurrentSkeleton();
    const { x, y } = getCanvasMousePosition(e);

    // If in Create mode: add a point to the current branch (backwards-compatible)
    if (mode === 'create') {
        if (!skeleton) return;

        // Backwards compatibility: if skeleton has flat API
        if (skeleton && typeof skeleton.addPoint === 'function' && Array.isArray(skeleton.points)) {
            const newPoint = skeleton.addPoint(x, y, 0);
            if (skeleton.points && skeleton.points.length > 1) {
                skeleton.addLine(skeleton.points[skeleton.points.length - 2], newPoint);
            }

        } else if (skeleton && Array.isArray(skeleton.branches)) {
            let branch = skeleton.branches[currentBranch];
            if (!branch) branch = skeleton.addBranch();

            const newPoint = branch.addPoint(x, y, 0);
            if (branch.points.length > 1) {
                branch.addLine(branch.points[branch.points.length - 2], newPoint);
            }

        } else {
            console.error('[main.click] No valid skeleton or branches to add point to');
        }

        chain.clear();
        redrawAll();
        return;
    }

    // If in Edit mode and a line is clicked, create a new branch starting at the projected point
    if (mode === 'edit') {
        if (!skeleton) return;
        const line = getLineAt(x, y);
        if (!line) return;

        // project click to the segment and create a new branch with that starting point
        const proj = projectPointToSegment(x, y, line.start.x, line.start.y, line.end.x, line.end.y);
        const newBranch = skeleton.addBranch();
        newBranch.addPoint(proj.x, proj.y, 0);

        // switch to the new branch and enter create mode
        currentBranch = skeleton.branches.indexOf(newBranch);
        mode = 'create';
        chain.clear();
        redrawAll();
        return;
    }
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

                    // call update on first branch if skeleton uses branches
                    const owner = (skeleton && Array.isArray(skeleton.branches) && skeleton.branches[0]) ? skeleton.branches[0] : skeleton;
                    if (owner && typeof owner.updatePoint === 'function') {
                        owner.updatePoint(draggedPoint, dragStartPoint.x, dragStartPoint.y, targetZ);
                    }
                } else {
                    const owner = (skeleton && Array.isArray(skeleton.branches) && skeleton.branches[0]) ? skeleton.branches[0] : skeleton;
                    if (owner && typeof owner.updatePoint === 'function') {
                        owner.updatePoint(draggedPoint, mouseX, mouseY, draggedPoint.z ?? 0);
                    }
                }

                chain.clear();
            } else if (mode === 'move') {
                if (isZDragging) {
                    const dy = mouseY - dragStartMouse.y;
                    const targetZ = dragStartPoint.z - dy * zDragScale;

                    const owner = (skeleton && Array.isArray(skeleton.branches) && skeleton.branches[0]) ? skeleton.branches[0] : skeleton;
                    if (owner && typeof owner.movePoint === 'function') {
                        owner.movePoint(draggedPoint, dragStartPoint.x, dragStartPoint.y, targetZ);
                    }
                } else {
                    const owner = (skeleton && Array.isArray(skeleton.branches) && skeleton.branches[0]) ? skeleton.branches[0] : skeleton;
                    if (owner && typeof owner.movePointXYLockedZ === 'function') {
                        owner.movePointXYLockedZ(draggedPoint, mouseX, mouseY, dragStartPoint ? dragStartPoint.z : (draggedPoint.z ?? 0));
                    }
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