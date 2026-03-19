const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const skeleton = new Skeleton();
const chain = new Chain();
let drawingFinished = false;

// Default trapezoid thickness
const trapezoidThickness = 50;

canvas.addEventListener('click', (e) => {
    if (drawingFinished) return;

    const x = e.clientX;
    const y = e.clientY;
    const newPoint = skeleton.addPoint(x, y);

    if (skeleton.points.length > 1) {
        skeleton.addLine(skeleton.points[skeleton.points.length - 2], newPoint);
    }

    draw();
});

// Draw all trapezoids in the chain
function drawChain(chain) {
    chain.getTrapezoids().forEach(item => {
        const pts = item.trapezoid.getPoints(item.position, item.rotation);
        ctx.fillStyle = 'rgba(0,200,0,0.3)';
        ctx.strokeStyle = 'green';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    });
}

document.addEventListener('keydown', (e) => {

    const key = e.key.toLowerCase();
    if (key === 'w') {

        chain.incrementTowardsFinal(0.01);

        draw();
        drawChain(chain);
    }

    if (key === 'e') {

        chain.applyFinalLayout();

        draw();
        drawChain(chain);
    }

    if (e.key === 'Enter') {

        drawingFinished = true;

        chain.buildFromSkeleton(
            skeleton,
            trapezoidThickness,
            skeleton.points[0].x,
            skeleton.points[0].y
        );

        draw();
        drawChain(chain);
    }

    if (e.key.toLowerCase() === 'q') {

        chain.resetToFlat();

        draw();
        drawChain(chain);
    }

    if (e.key.toLowerCase() === 'd') {
            chain.exportFlatDXF();
    }

});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw skeleton lines
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 2;
    skeleton.lines.forEach(l => {
        ctx.beginPath();
        ctx.moveTo(l.start.x, l.start.y);
        ctx.lineTo(l.end.x, l.end.y);
        ctx.stroke();
    });

    // Draw skeleton points
    ctx.fillStyle = 'red';
    skeleton.points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
    });
}