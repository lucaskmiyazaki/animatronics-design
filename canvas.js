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

function drawSkeleton(ctx, skeleton, hoveredPoint = null, pointRadius = 5, hoverRadius = 9) {
    if (!skeleton) return;

    // Backwards-compatible: flat skeleton with `lines` and `points` arrays
    if (skeleton.lines && skeleton.points) {
        skeleton.lines.forEach(line => drawLine(ctx, line.start, line.end, 'blue', 2));

        skeleton.points.forEach(point => {
            const radius = point === hoveredPoint ? hoverRadius : pointRadius;
            drawPoint(ctx, point, radius, 'red');
        });

        return;
    }

    // New structure: skeleton.branches (array of Branch)
    if (skeleton.branches) {
        skeleton.branches.forEach(branch => {
            branch.lines.forEach(line => drawLine(ctx, line.start, line.end, 'blue', 2));

            branch.points.forEach(point => {
                const radius = point === hoveredPoint ? hoverRadius : pointRadius;
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

