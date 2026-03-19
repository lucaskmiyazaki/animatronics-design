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

    skeleton.lines.forEach(line => {
        drawLine(ctx, line.start, line.end, 'blue', 2);
    });

    skeleton.points.forEach(point => {
        const radius = point === hoveredPoint ? hoverRadius : pointRadius;
        drawPoint(ctx, point, radius, 'red');
    });
}

