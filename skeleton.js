class Point {
    constructor(x, y, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.lines = [];
        this.angle = 180;
    }

    updateAngle() {
        if (this.lines.length === 0) {
            this.angle = 0;
        } else if (this.lines.length === 1) {
            this.angle = 180;
        } else if (this.lines.length === 2) {
            const [l1, l2] = this.lines;

            const p1 = l1.getOtherPoint(this);
            const p2 = l2.getOtherPoint(this);

            const v1 = {
                x: p1.x - this.x,
                y: p1.y - this.y,
                z: p1.z - this.z
            };

            const v2 = {
                x: p2.x - this.x,
                y: p2.y - this.y,
                z: p2.z - this.z
            };

            const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
            const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
            const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);

            if (mag1 === 0 || mag2 === 0) {
                this.angle = 0;
                return;
            }

            let cosTheta = dot / (mag1 * mag2);
            cosTheta = Math.max(-1, Math.min(1, cosTheta));

            this.angle = Math.acos(cosTheta) * (180 / Math.PI);
        }
    }
}

class Line {
    constructor(startPoint, endPoint) {
        this.start = startPoint;
        this.end = endPoint;

        this.xyAngle = 0;
        this.elevationAngle = 0;
        this.length = 0;

        this.updateAngle();

        this.start.lines.push(this);
        this.end.lines.push(this);
    }

    getOtherPoint(point) {
        return point === this.start ? this.end : this.start;
    }

    computeDirection() {
        return {
            x: this.end.x - this.start.x,
            y: this.end.y - this.start.y,
            z: this.end.z - this.start.z
        };
    }

    computeLength() {
        const d = this.computeDirection();
        return Math.sqrt(d.x ** 2 + d.y ** 2 + d.z ** 2);
    }

    computeXYAngle() {
        const dx = this.end.x - this.start.x;
        const dy = this.end.y - this.start.y;

        let deg = Math.atan2(dy, dx) * (180 / Math.PI);
        deg = ((deg % 360) + 360) % 360;

        return deg;
    }

    computeElevationAngle() {
        const dx = this.end.x - this.start.x;
        const dy = this.end.y - this.start.y;
        const dz = this.end.z - this.start.z;

        const horizontalLength = Math.sqrt(dx ** 2 + dy ** 2);

        let deg = Math.atan2(dz, horizontalLength) * (180 / Math.PI);
        deg = ((deg % 360) + 360) % 360;

        return deg;
    }

    updateAngle() {
        this.xyAngle = this.computeXYAngle();
        this.elevationAngle = this.computeElevationAngle();
        this.length = this.computeLength();
    }
}

class Skeleton {
    constructor() {
        this.points = [];
        this.lines = [];
    }

    addPoint(x, y, z = 0) {
        const p = new Point(x, y, z);
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

    updatePoint(point, x, y, z = point.z) {
        point.x = x;
        point.y = y;
        point.z = z;

        point.lines.forEach(line => {
            line.updateAngle();
        });

        point.updateAngle();

        point.lines.forEach(line => {
            const neighbor = line.getOtherPoint(point);
            neighbor.updateAngle();
        });
    }

    updateAllGeometry() {
        this.lines.forEach(line => line.updateAngle());
        this.points.forEach(point => point.updateAngle());
    }
}