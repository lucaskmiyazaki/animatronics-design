class Link {
    constructor(length, diameter, normal1, normal2) {
        this.length = length;
        this.diameter = diameter;
        this.radius = diameter / 2;

        this.position = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };

        this.normal1 = normal1;
        this.normal2 = normal2;
    }

    setPosition(x, y, z) {
        this.position = { x, y, z };
    }

    setRotation(rx, ry, rz) {
        this.rotation = { x: rx, y: ry, z: rz };
    }

    rotateVector(v) {
        let { x, y, z } = v;

        const cx = Math.cos(this.rotation.x);
        const sx = Math.sin(this.rotation.x);
        const cy = Math.cos(this.rotation.y);
        const sy = Math.sin(this.rotation.y);
        const cz = Math.cos(this.rotation.z);
        const sz = Math.sin(this.rotation.z);

        // rotate around X
        let x1 = x;
        let y1 = y * cx - z * sx;
        let z1 = y * sx + z * cx;

        // rotate around Y
        let x2 = x1 * cy + z1 * sy;
        let y2 = y1;
        let z2 = -x1 * sy + z1 * cy;

        // rotate around Z
        let x3 = x2 * cz - y2 * sz;
        let y3 = x2 * sz + y2 * cz;
        let z3 = z2;

        return { x: x3, y: y3, z: z3 };
    }

    getBottomNormal() {
        return this.rotateVector(this.normal1);
    }

    getTopNormal() {
        return this.rotateVector(this.normal2);
    }

    getBottomCenter() {
        return {
            x: this.position.x,
            y: this.position.y,
            z: this.position.z
        };
    }

    getTopCenter() {
        const axis = this.rotateVector({ x: 1, y: 0, z: 0 });

        return {
            x: this.position.x + axis.x * this.length,
            y: this.position.y + axis.y * this.length,
            z: this.position.z + axis.z * this.length
        };
    }

    // 2D helpers
    add2D(a, b) {
        return { x: a.x + b.x, y: a.y + b.y };
    }

    sub2D(a, b) {
        return { x: a.x - b.x, y: a.y - b.y };
    }

    mul2D(v, s) {
        return { x: v.x * s, y: v.y * s };
    }

    normalize2D(v) {
        const m = Math.hypot(v.x, v.y);
        if (m < 1e-8) return { x: 1, y: 0 };
        return { x: v.x / m, y: v.y / m };
    }

    perpendicular2D(v) {
        return { x: -v.y, y: v.x };
    }

    cross2D(a, b) {
        return a.x * b.y - a.y * b.x;
    }

    intersectLines(p1, d1, p2, d2) {
        const denom = this.cross2D(d1, d2);

        if (Math.abs(denom) < 1e-8) {
            return { x: p1.x, y: p1.y };
        }

        const diff = this.sub2D(p2, p1);
        const t = this.cross2D(diff, d2) / denom;

        return this.add2D(p1, this.mul2D(d1, t));
    }

    getXYProjection() {
        const bottom3D = this.getBottomCenter();
        const top3D = this.getTopCenter();

        const bottomCenter = { x: bottom3D.x, y: bottom3D.y };
        const topCenter = { x: top3D.x, y: top3D.y };

        const axis2D = this.sub2D(topCenter, bottomCenter);
        const axisDir = this.normalize2D(axis2D);
        const offsetDir = this.perpendicular2D(axisDir);

        const halfThickness = this.diameter / 2;

        const bottomNormal2D = this.normalize2D({
            x: this.getBottomNormal().x,
            y: this.getBottomNormal().y
        });

        const topNormal2D = this.normalize2D({
            x: this.getTopNormal().x,
            y: this.getTopNormal().y
        });

        // side lines are perpendicular to normals
        const bottomSideDir = this.perpendicular2D(bottomNormal2D);
        const topSideDir = this.perpendicular2D(topNormal2D);

        // upper and lower rails
        const upperRailPoint = this.add2D(
            bottomCenter,
            this.mul2D(offsetDir, halfThickness)
        );

        const lowerRailPoint = this.add2D(
            bottomCenter,
            this.mul2D(offsetDir, -halfThickness)
        );

        const upperRailDir = axisDir;
        const lowerRailDir = axisDir;

        // 4 intersections
        const p1 = this.intersectLines(
            bottomCenter,
            bottomSideDir,
            upperRailPoint,
            upperRailDir
        );

        const p2 = this.intersectLines(
            topCenter,
            topSideDir,
            upperRailPoint,
            upperRailDir
        );

        const p3 = this.intersectLines(
            topCenter,
            topSideDir,
            lowerRailPoint,
            lowerRailDir
        );

        const p4 = this.intersectLines(
            bottomCenter,
            bottomSideDir,
            lowerRailPoint,
            lowerRailDir
        );

        return [p1, p2, p3, p4];
    }
}