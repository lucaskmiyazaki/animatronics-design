function clearCanvas(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawPolygon(ctx, points, fillStyle = 'rgba(0,200,0,0.3)', strokeStyle = 'green', lineWidth = 2) {
    if (!points || points.length === 0) return;

    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawLine(ctx, start, end, color = 'blue', lineWidth = 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
}

function drawPoint(ctx, point, radius = 5, color = 'red') {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
}
// track last mouse position on canvas for hover detection
let _canvasMouseX = null;
let _canvasMouseY = null;
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    _canvasMouseX = e.clientX - rect.left;
    _canvasMouseY = e.clientY - rect.top;
});

// helper: distance from point (px,py) to segment (x1,y1)-(x2,y2)
function _distancePointToSegment(px, py, x1, y1, x2, y2) {
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

function drawSkeleton(ctx, skeleton, hoveredPoint = null, pointRadius = 5, hoverRadius = 9) {
    if (!skeleton) return;

    // determine whether we should highlight lines (edit or move mode)
    let highlightByMouse = false;
    try {
        if (typeof getMode === 'function') {
            const m = getMode();
            if (m === 'edit' || m === 'move') highlightByMouse = true;
        }
    } catch (e) {}

    // find hovered line if applicable (only when not hovering a point)
    let hoveredLine = null;
    if (!hoveredPoint && highlightByMouse && typeof _canvasMouseX === 'number' && typeof _canvasMouseY === 'number') {
        let best = null;
        let bestDist = Infinity;
        if (skeleton.lines) {
            for (const line of skeleton.lines) {
                const d = _distancePointToSegment(_canvasMouseX, _canvasMouseY, line.start.x, line.start.y, line.end.x, line.end.y);
                if (d < bestDist) { bestDist = d; best = line; }
            }
        }
        if (skeleton.branches) {
            for (const branch of skeleton.branches) {
                for (const line of branch.lines) {
                    const d = _distancePointToSegment(_canvasMouseX, _canvasMouseY, line.start.x, line.start.y, line.end.x, line.end.y);
                    if (d < bestDist) { bestDist = d; best = line; }
                }
            }
        }

        if (best && typeof hitRadius !== 'undefined' && bestDist <= hitRadius) hoveredLine = best;
    }

    // scale drawing sizes when in edit/move modes
    const lineWidthNormal = highlightByMouse ? 3 : 2;
    const lineWidthHover = highlightByMouse ? 8 : 6;
    const effectivePointRadius = highlightByMouse ? Math.round(pointRadius * 1.6) : pointRadius;
    const effectiveHoverRadius = highlightByMouse ? Math.round(hoverRadius * 1.6) : hoverRadius;

    // Backwards-compatible: flat skeleton with `lines` and `points` arrays
    if (skeleton.lines && skeleton.points) {
        skeleton.lines.forEach(line => {
            const isHovered = hoveredLine === line;
            drawLine(ctx, line.start, line.end, isHovered ? 'orange' : 'blue', isHovered ? lineWidthHover : lineWidthNormal);
        });

        skeleton.points.forEach(point => {
            const radius = point === hoveredPoint ? effectiveHoverRadius : effectivePointRadius;
            drawPoint(ctx, point, radius, 'red');
        });

        return;
    }

    // New structure: skeleton.branches (array of Branch)
    if (skeleton.branches) {
        skeleton.branches.forEach(branch => {
            branch.lines.forEach(line => {
                const isHovered = hoveredLine === line;
                drawLine(ctx, line.start, line.end, isHovered ? 'orange' : 'blue', isHovered ? lineWidthHover : lineWidthNormal);
            });

            branch.points.forEach(point => {
                const radius = point === hoveredPoint ? effectiveHoverRadius : effectivePointRadius;
                drawPoint(ctx, point, radius, 'red');
            });
        });

        // Draw connections (optional) as dashed lines with projection marker
        if (skeleton.connections && skeleton.connections.length > 0) {
            ctx.save();
            ctx.setLineDash([6, 4]);
            skeleton.connections.forEach(conn => {
                const fromBranch = skeleton.branches[conn.fromBranch];
                const toBranch = skeleton.branches[conn.toBranch];
                if (!fromBranch || !toBranch) return;

                const pFrom = fromBranch.points && fromBranch.points[0];
                const line = toBranch.lines && toBranch.lines[conn.lineIndex];
                if (!pFrom || !line) return;

                const proj = conn.proj || (function() {
                    const start = line.start;
                    const end = line.end;
                    const seg = toBranch.sub3(end, start);
                    const ap = toBranch.sub3(pFrom, start);
                    const segLen2 = toBranch.dot3(seg, seg);
                    let t = segLen2 < 1e-8 ? 0 : toBranch.dot3(ap, seg) / segLen2;
                    t = toBranch.clamp(t, 0, 1);
                    return toBranch.add3(start, toBranch.mul3(seg, t));
                })();

                drawLine(ctx, pFrom, proj, 'purple', 1);
                drawPoint(ctx, proj, 4, 'orange');
            });
            ctx.restore();
        }
    }
}

