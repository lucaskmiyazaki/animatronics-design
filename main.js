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
let hoveredBranchIndex = -1;
let draggedPoint = null;
// set to the draggedPoint value at last mousedown; used to suppress click-on-line when editing a point
let mouseDownDraggedPoint = null;
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

//function drawCurrentChain() {
//    chain.getLinks().forEach(link => {
//        const polygon = link.getXYProjection();
//        drawPolygon(ctx, polygon, 'rgba(255,165,0,0.25)', 'orange', 2);
//
//        polygon.forEach(p => {
//            drawPoint(ctx, p, 4, 'black');
//        });
//    });
//}

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

function normalize2(vx, vy) {
    const len = Math.hypot(vx, vy) || 1;
    return { x: vx / len, y: vy / len };
}

function getPerp(vx, vy) {
    return { x: -vy, y: vx };
}

function getPointDiameter(point, fallback = 20) {
    return point?.diameter ?? fallback;
}

function getCrossEdgeAtPoint(point, refLine, fallbackDiameter = 20) {
    if (!point || !refLine) return null;

    const other = refLine.start === point ? refLine.end : refLine.start;
    if (!other) return null;

    const dir = normalize2(other.x - point.x, other.y - point.y);
    const perp = getPerp(dir.x, dir.y);

    const radius = getPointDiameter(point, fallbackDiameter) / 2;

    return [
        {
            x: point.x + perp.x * radius,
            y: point.y + perp.y * radius
        },
        {
            x: point.x - perp.x * radius,
            y: point.y - perp.y * radius
        }
    ];
}

function clearAllMeshPolygons(skeleton) {
    if (!skeleton) return;

    if (Array.isArray(skeleton.points)) {
        skeleton.points.forEach(p => p.meshPolygons = []);
    }

    if (Array.isArray(skeleton.branches)) {
        skeleton.branches.forEach(branch => {
            if (Array.isArray(branch.points)) {
                branch.points.forEach(p => p.meshPolygons = []);
            }
        });
    }
}

function getSharedEdgeForPoint(branch, pointIndex) {
    const point = branch.points[pointIndex];

    // use the NEXT line direction
    // for the last point, fall back to previous line
    let refPoint;
    if (pointIndex < branch.points.length - 1) {
        refPoint = branch.points[pointIndex + 1];
    } else if (pointIndex > 0) {
        refPoint = branch.points[pointIndex - 1];
    } else {
        return null;
    }

    const dx = refPoint.x - point.x;
    const dy = refPoint.y - point.y;
    const len = Math.hypot(dx, dy) || 1;

    const dir = { x: dx / len, y: dy / len };
    const perp = { x: -dir.y, y: dir.x };

    const r = (point.diameter ?? 20) / 2;

    return [
        { x: point.x + perp.x * r, y: point.y + perp.y * r },
        { x: point.x - perp.x * r, y: point.y - perp.y * r }
    ];
}

function edgeDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function orientEdgeLikeReference(refEdge, edge) {
    const direct =
        edgeDistance(refEdge[0], edge[0]) + edgeDistance(refEdge[1], edge[1]);

    const flipped =
        edgeDistance(refEdge[0], edge[1]) + edgeDistance(refEdge[1], edge[0]);

    return flipped > direct ? [edge[1], edge[0]] : edge;
}

function generateMeshPolygonsForBranch(branch) {
    if (!branch || !branch.points || branch.points.length < 2) return;

    const sharedEdges = branch.points.map((_, i) => getSharedEdgeForPoint(branch, i));

    branch.points.forEach(point => {
        point.meshPolygons = [];
    });

    for (let i = 0; i < branch.points.length - 1; i++) {
        let edgeA = sharedEdges[i];
        let edgeB = sharedEdges[i + 1];

        if (!edgeA || !edgeB) continue;

        edgeB = orientEdgeLikeReference(edgeA, edgeB);

        const quad = [
            edgeA[0],
            edgeA[1],
            edgeB[0],
            edgeB[1]
        ];

        branch.points[i].meshPolygons.push(quad);
        branch.points[i + 1].meshPolygons.push(quad);
    }
}

function generateMeshPolygonsForSkeleton(skeleton) {
    if (!skeleton) return;

    clearAllMeshPolygons(skeleton);

    if (Array.isArray(skeleton.branches) && skeleton.branches.length > 0) {
        skeleton.branches.forEach(branch => {
            generateMeshPolygonsForBranch(branch);
        });
        return;
    }

    // flat skeleton fallback
    if (Array.isArray(skeleton.points) && Array.isArray(skeleton.lines)) {
        const fakeBranch = {
            points: skeleton.points,
            lines: skeleton.lines
        };
        generateMeshPolygonsForBranch(fakeBranch);
    }
}

function drawMeshPolygons(ctx, skeleton) {
    if (!skeleton) return;

    let points = [];

    if (skeleton.points) {
        points = skeleton.points;
    } else if (skeleton.branches) {
        skeleton.branches.forEach(branch => {
            if (branch.points) points.push(...branch.points);
        });
    }

    points.forEach(point => {
        if (!point.meshPolygons) return;

        point.meshPolygons.forEach(poly => {
            drawPolygon(ctx, poly, 'rgba(0,150,255,0.3)', 'cyan', 2);
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

    drawMeshPolygons(ctx, getCurrentSkeleton());

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

function drawChains3DForAllBranches(diameter = 20) {
    if (window.chain3DView) {
        window.chain3DView.drawChainsForSkeleton(getCurrentSkeleton(), diameter);
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

    chain.buildFromSkeleton(useSkeleton);
    redrawAll();

    return chain.getLinks();
}

canvas.addEventListener('click', (e) => {
    const skeleton = ensureCurrentSkeleton();
    const { x, y } = getCanvasMousePosition(e);

    if (mouseDownDraggedPoint) {
        mouseDownDraggedPoint = null;
        if (mode === 'edit') return;
    }

    if (mode === 'create') {
        if (!skeleton) return;

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
            syncMirrorIfNeeded(branch);

        } else {
            console.error('[main.click] No valid skeleton or branches to add point to');
        }

        chain.clear();
        redrawAll();
        return;
    }

    if (mode === 'mirror') {
        if (!skeleton) return;

        const line = getLineAt(x, y);
        if (!line) return;

        const branchIndex = findBranchIndexForLine(line);
        if (branchIndex === -1) return;

        if (typeof skeleton.addMirrorBranch === 'function') {
            const mirrorBranchIndex = skeleton.addMirrorBranch(branchIndex);
            console.log('[mirror] created mirror branch', {
                sourceBranch: branchIndex,
                mirrorBranch: mirrorBranchIndex
            });
        } else {
            console.warn('[mirror] skeleton.addMirrorBranch(branchIndex) is not implemented yet');
        }

        chain.clear();
        redrawAll();
        return;
    }

    if (mode === 'edit') {
        if (!skeleton) return;
        const line = getLineAt(x, y);
        if (!line) return;

        let lineBranchIndex = -1;
        let lineIndexInBranch = -1;
        for (let i = 0; i < skeleton.branches.length; i++) {
            const idx = skeleton.branches[i].lines.indexOf(line);
            if (idx !== -1) {
                lineBranchIndex = i;
                lineIndexInBranch = idx;
                break;
            }
        }

        const proj = projectPointToSegment(x, y, line.start.x, line.start.y, line.end.x, line.end.y);
        const newBranch = skeleton.addBranch();
        newBranch.addPoint(proj.x, proj.y, 0);

        const newBranchIndex = skeleton.branches.indexOf(newBranch);
        if (lineBranchIndex !== -1 && lineIndexInBranch !== -1) {
            skeleton.connectFirstPointToLine(newBranchIndex, lineBranchIndex, lineIndexInBranch);
        }

        currentBranch = newBranchIndex;
        mode = 'create';
        chain.clear();
        redrawAll();
        return;
    }
});

canvas.addEventListener('mousedown', (e) => {
    if (mode !== 'edit' && mode !== 'move' && mode !== 'mesh') return;

    const { x, y } = getCanvasMousePosition(e);
    const skeleton = getCurrentSkeleton();
    let clickedPoint = getPointAt(x, y);

    // In move mode, prevent dragging the first point of a linked branch
    if (mode === 'move' && clickedPoint && skeleton && skeleton.branches) {
        const branchIndex = skeleton.branches.findIndex(
            b => b && b.points && b.points[0] === clickedPoint
        );

        if (branchIndex !== -1 && skeleton.connections) {
            const linkedConnections = skeleton.connections.filter(
                conn => conn.fromBranch === branchIndex
            );

            if (linkedConnections.length > 0) {
                clickedPoint = null;
            }
        }
    }

    draggedPoint = clickedPoint;
    mouseDownDraggedPoint = draggedPoint;

    if (mode === 'mesh') {
        if (draggedPoint) {
            if (draggedPoint.diameter == null) {
                draggedPoint.diameter = 20;
            }

            generateMeshPolygonsForSkeleton(skeleton);
        }

        redrawAll();
        return;
    }

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

    if (mode === 'mirror') {
        const line = getLineAt(mouseX, mouseY);
        
        if (line) {
            hoveredBranchIndex = findBranchIndexForLine(line);
        } else {
            hoveredBranchIndex = -1;
        }

        redrawAll();
        return;
    }

    if (draggedPoint) {
        const skeleton = getCurrentSkeleton();

        if (skeleton) {
            isZDragging = !!e.shiftKey && !!dragStartMouse && !!dragStartPoint;

            if (mode === 'edit') {
                const owner = findOwnerForPoint(draggedPoint);
                if (owner && typeof owner.updatePoint === 'function') {
                    let targetX = mouseX;
                    let targetY = mouseY;
                    let targetZ = draggedPoint.z ?? 0;

                    // Check if this is the first point of a linked branch - constrain to line
                    const branchIndex = skeleton.branches.indexOf(owner);
                    const isLinkedFirstPoint = branchIndex !== -1 && 
                        owner.points.length > 0 && 
                        owner.points[0] === draggedPoint &&
                        skeleton.connections && 
                        skeleton.connections.some(conn => conn.fromBranch === branchIndex);

                    if (isLinkedFirstPoint) {
                        // Find the line this point is connected to
                        const conn = skeleton.connections.find(c => c.fromBranch === branchIndex);
                        if (conn) {
                            const linkedBranch = skeleton.branches[conn.toBranch];
                            const line = linkedBranch.lines[conn.lineIndex];
                            if (line) {
                                // Project mouse position onto the line
                                const proj = projectPointToSegment(mouseX, mouseY, line.start.x, line.start.y, line.end.x, line.end.y);
                                targetX = proj.x;
                                targetY = proj.y;
                            }
                        }
                    }

                    if (isZDragging) {
                        const dy = mouseY - dragStartMouse.y;
                        targetZ = dragStartPoint.z - dy * zDragScale;
                        owner.updatePoint(draggedPoint, dragStartPoint.x, dragStartPoint.y, targetZ, skeleton);
                    } else {
                        owner.updatePoint(draggedPoint, targetX, targetY, targetZ, skeleton);
                    }

                    // Update connection parameters after moving the point
                    if (skeleton && skeleton.updateConnections) {
                        skeleton.updateConnections();
                    }
                }
                syncMirrorIfNeeded(owner);
                chain.clear();
            } else if (mode === 'move') {
                const owner = findOwnerForPoint(draggedPoint);
                if (owner && typeof owner.movePoint === 'function') {
                    if (isZDragging) {
                        const dy = mouseY - dragStartMouse.y;
                        const targetZ = dragStartPoint.z - dy * zDragScale;
                        owner.movePoint(draggedPoint, dragStartPoint.x, dragStartPoint.y, targetZ, 0.2, skeleton);
                    } else {
                        owner.movePointXYLockedZ(draggedPoint, mouseX, mouseY, dragStartPoint ? dragStartPoint.z : (draggedPoint.z ?? 0), 0.2, skeleton);
                    }
                }
                syncMirrorIfNeeded(owner);
                chain.clear();
            } else if (mode === 'mesh' && draggedPoint) {
                const dx = mouseX - draggedPoint.x;
                const dy = mouseY - draggedPoint.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                const newDiameter = Math.max(2, dist * 2);
                draggedPoint.diameter = newDiameter;
                const owner = findOwnerForPoint(draggedPoint);
                syncMirrorIfNeeded(owner);
                generateMeshPolygonsForSkeleton(skeleton);
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
    else if (mode === 'move') mode = 'mesh';
    else if (mode === 'mesh') mode = 'mirror';
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

function findBranchIndexForLine(line) {
    const skeleton = getCurrentSkeleton();
    if (!skeleton || !line || !skeleton.branches) return -1;

    for (let i = 0; i < skeleton.branches.length; i++) {
        const branch = skeleton.branches[i];
        if (branch && branch.lines && branch.lines.includes(line)) {
            return i;
        }
    }

    return -1;
}

function syncMirrorIfNeeded(branch) {
    const skeleton = getCurrentSkeleton();
    if (!skeleton || !branch) return;

    const branchIndex = skeleton.branches.indexOf(branch);
    if (branchIndex === -1) return;

    // skip if this branch is itself a mirror
    if (typeof skeleton.isMirrorBranch === 'function' &&
        skeleton.isMirrorBranch(branchIndex)) {
        return;
    }

    if (typeof skeleton.syncMirrorBranch === 'function') {
        skeleton.syncMirrorBranch(branchIndex);
    }
}

function cloneSkeleton(sourceSkeleton) {
    if (!sourceSkeleton) return null;

    const newSkeleton = new Skeleton();

    // Maps old branch -> new branch
    const branchMap = new Map();

    // Maps old point -> new point
    const pointMap = new Map();

    // 1) Clone branches, points, and lines
    (sourceSkeleton.branches || []).forEach(oldBranch => {
    if (!oldBranch) return;

    const newBranch = newSkeleton.addBranch();
    branchMap.set(oldBranch, newBranch);

    if (Array.isArray(oldBranch.points)) {
        oldBranch.points.forEach(oldPoint => {
            const newPoint = newBranch.addPoint(
                oldPoint.x,
                oldPoint.y,
                oldPoint.z ?? 0
            );
            pointMap.set(oldPoint, newPoint);
        });
    }

    if (Array.isArray(oldBranch.lines)) {
        oldBranch.lines.forEach(oldLine => {
            const newStart = pointMap.get(oldLine.start);
            const newEnd = pointMap.get(oldLine.end);
            if (!newStart || !newEnd) return;

            const newLine = newBranch.addLine(newStart, newEnd);

            if ('length' in oldLine) newLine.length = oldLine.length;
            if ('originalLength' in oldLine) newLine.originalLength = oldLine.originalLength;
        });
    }
});

    // 2) Clone connections
    (sourceSkeleton.connections || []).forEach(oldConn => {
        const newConn = {
            fromBranch: oldConn.fromBranch,
            toBranch: oldConn.toBranch,
            lineIndex: oldConn.lineIndex,
            t: oldConn.t,
            proj: oldConn.proj
                ? {
                    x: oldConn.proj.x,
                    y: oldConn.proj.y,
                    z: oldConn.proj.z ?? 0
                }
                : null
        };

        newSkeleton.connections.push(newConn);
    });

    // 3) Recompute projections to ensure consistency with cloned geometry
    if (typeof newSkeleton.updateConnections === 'function') {
        newSkeleton.updateConnections();
    }

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

function undoLastAction() {
    const skeleton = getCurrentSkeleton();
    if (!skeleton || !skeleton.branches || skeleton.branches.length === 0) return;

    let branch = skeleton.branches[currentBranch];

    // fallback to last existing branch if currentBranch is invalid
    if (!branch) {
        currentBranch = skeleton.branches.length - 1;
        branch = skeleton.branches[currentBranch];
    }

    if (!branch) return;

    // remove last point from current branch
    if (branch.points && branch.points.length > 0) {
        branch.removeLastPoint();

        // if branch became empty, remove it entirely
        if (branch.points.length === 0) {
            skeleton.removeBranch(currentBranch);
            currentBranch = Math.max(0, Math.min(currentBranch - 1, skeleton.branches.length - 1));
        }

        chain.clear();
        redrawAll();
        return;
    }

    // if branch already empty, remove branch
    skeleton.removeBranch(currentBranch);
    currentBranch = Math.max(0, Math.min(currentBranch - 1, skeleton.branches.length - 1));

    chain.clear();
    redrawAll();
}

function clearCurrentFrameSkeleton() {
    if (!frameSkeletons[currentFrameIndex]) return;

    delete frameSkeletons[currentFrameIndex];

    hoveredPoint = null;
    hoveredLine = null;
    draggedPoint = null;
    mouseDownDraggedPoint = null;
    dragStartMouse = null;
    dragStartPoint = null;
    isZDragging = false;
    currentBranch = 0;

    chain.clear();
    redrawAll();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift' && draggedPoint && (mode === 'edit' || mode === 'move')) {
        isZDragging = true;
        redrawAll();
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

function connectBranches(branchAIndex, branchBIndex, lineIndex) {
    const skeleton = getCurrentSkeleton();
    if (!skeleton) return null;
    const conn = skeleton.connectFirstPointToLine(branchAIndex, branchBIndex, lineIndex);
    redrawAll();
    return conn;
}

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
    drawChain3D,
    drawChains3DForAllBranches,
    connectBranches,
    undoLastAction,
    clearCurrentFrameSkeleton,
};