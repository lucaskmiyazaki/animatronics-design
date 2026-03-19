// skeleton.js
class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.lines = [];
        this.angle = 180; // default
    }

    updateAngle() {
        if (this.lines.length === 1) {
            this.angle = 180;
        } else if (this.lines.length === 2) {
            const [l1, l2] = this.lines;
            const v1 = { x: l1.getOtherPoint(this).x - this.x, y: l1.getOtherPoint(this).y - this.y };
            const v2 = { x: l2.getOtherPoint(this).x - this.x, y: l2.getOtherPoint(this).y - this.y };
            const angle1 = Math.atan2(v1.y, v1.x);
            const angle2 = Math.atan2(v2.y, v2.x);
            let deg = (angle2 - angle1) * (180 / Math.PI);

            // Normalize to [0, 360)
            deg = ((deg % 360) + 360) % 360;

            this.angle = deg;
        }
    }
}

class Line {
    constructor(startPoint, endPoint) {
        this.start = startPoint;
        this.end = endPoint;
        this.angle = this.computeAngle();
        this.start.lines.push(this);
        this.end.lines.push(this);
    }

    getOtherPoint(point) {
        return point === this.start ? this.end : this.start;
    }

    computeAngle() {
        const dx = this.end.x - this.start.x;
        const dy = this.end.y - this.start.y;
        let deg = Math.atan2(dy, dx) * (180 / Math.PI);

        // Normalize to [0, 360)
        deg = ((deg % 360) + 360) % 360;

        return deg;
    }

    updateAngle() {
        this.angle = this.computeAngle();
    }
}

class Skeleton {
    constructor() {
        this.points = [];
        this.lines = [];
    }

    addPoint(x, y) {
        const p = new Point(x, y);
        this.points.push(p);
        return p;
    }

    addLine(p1, p2) {
        const l = new Line(p1, p2);
        this.lines.push(l);
        p1.updateAngle();
        p2.updateAngle();
        return l;
    }

    updateAngles() {
        this.lines.forEach(l => l.updateAngle());
        this.points.forEach(p => p.updateAngle());
    }
}