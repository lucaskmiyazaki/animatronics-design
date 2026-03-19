class Trapezoid {
    /**
     * @param {number} meanLineLength
     * @param {number} angleLeft - degrees
     * @param {number} angleRight - degrees
     * @param {number} thickness
     */
    constructor(meanLineLength, angleLeft, angleRight, thickness) {
        this.meanLineLength = meanLineLength;
        //angleLeft = angleLeft/2;
        //angleRight = angleRight/2;
        this.angleLeft = angleLeft * Math.PI / 360;
        this.angleRight = angleRight * Math.PI / 360;
        this.thickness = thickness;

        const th2 = thickness / 2;

        // Precompute points at position=0, rotation=0
        this.localPoints = [
            { x: -th2 / Math.tan(this.angleLeft), y:  th2 },                          // top-left
            { x: meanLineLength + th2 / Math.tan(this.angleRight), y:  th2 },         // top-right
            { x: meanLineLength - th2 / Math.tan(this.angleRight), y: -th2 },         // bottom-right
            { x: th2 / Math.tan(this.angleLeft), y: -th2 }                            // bottom-left
        ];
    }

    getPoints(position, rotation) {
        const rot = rotation * Math.PI / 180;
        return this.localPoints.map(p => {
            const x = Math.cos(rot) * p.x - Math.sin(rot) * p.y + position.x;
            const y = Math.sin(rot) * p.x + Math.cos(rot) * p.y + position.y;
            return { x, y };
        });
    }

    getLeftExcess() {
        const midX = (this.localPoints[0].x + this.localPoints[3].x) / 2;
        const leftExcess = Math.max(
            Math.abs(this.localPoints[0].x - midX), // top-left
            Math.abs(this.localPoints[3].x - midX)  // bottom-left
        );
        return leftExcess;
    }

    getRightExcess() {
        const midX = (this.localPoints[1].x + this.localPoints[2].x) / 2;
        const rightExcess = Math.max(
            Math.abs(this.localPoints[1].x - midX), // top-right
            Math.abs(this.localPoints[2].x - midX)  // bottom-right
        );
        return rightExcess;
    }
}

class Chain {

    constructor() {
        this.trapezoids = [];
    }

    clear() {
        this.trapezoids = [];
    }

    buildFromSkeleton(skeleton, thickness, startX = 0, baseY = 0) {

        this.clear();

        let prev = null;

        skeleton.lines.forEach(line => {

            const meanLength = Math.hypot(
                line.end.x - line.start.x,
                line.end.y - line.start.y
            );

            const trap = new Trapezoid(
                meanLength,
                line.start.angle,
                line.end.angle,
                thickness
            );

            // Compute flat X position immediately
            let flatX;

            if (!prev) {
                flatX = startX;
            }
            else {
                flatX =
                    prev.flatPosition.x +
                    prev.trapezoid.meanLineLength +
                    prev.trapezoid.getRightExcess() +
                    trap.getLeftExcess();
            }

            const item = {

                trapezoid: trap,
                skeletonLine: line,

                // flat state (computed immediately)
                flatPosition: { x: flatX, y: baseY },
                flatRotation: 0,

                // final state
                finalPosition: {
                    x: line.start.x,
                    y: line.start.y
                },

                finalRotation: line.angle,

                // current state initialized as flat
                position: { x: flatX, y: baseY },
                rotation: 0

            };

            this.trapezoids.push(item);

            prev = item;

        });
    }


    applyFinalLayout() {

        this.trapezoids.forEach(item => {

            item.position.x = item.finalPosition.x;
            item.position.y = item.finalPosition.y;
            item.rotation = item.finalRotation;

        });

    }


    shortestAngleDifference(from, to) {
        let diff = to - from;
        diff = ((diff + 180) % 360 + 360) % 360 - 180;
        return diff;
    }

    incrementTowardsFinal(fraction) {

        this.trapezoids.forEach(item => {

            const dx =
                item.finalPosition.x -
                item.flatPosition.x;

            const dy =
                item.finalPosition.y -
                item.flatPosition.y;

            const dr =
            this.shortestAngleDifference(
                item.flatRotation,
                item.finalRotation
            );

            item.position.x += dx * fraction;
            item.position.y += dy * fraction;

            console.log(dr)
            item.rotation += dr * fraction;

        });

    }


    resetToFlat() {

        this.trapezoids.forEach(item => {

            item.position.x = item.flatPosition.x;
            item.position.y = item.flatPosition.y;
            item.rotation = item.flatRotation;

        });

    }


    getTrapezoids() {
        return this.trapezoids;
    }

    exportFlatDXF(filename = "chain_flat.dxf") {

        const trapezoids = this.trapezoids;
        if (trapezoids.length === 0) return;
        let dxf = "";

        // DXF HEADER
        dxf += "0\nSECTION\n2\nHEADER\n0\nENDSEC\n";

        // ENTITIES SECTION
        dxf += "0\nSECTION\n2\nENTITIES\n";

        trapezoids.forEach(item => {

            const pts = item.trapezoid.getPoints(
                item.flatPosition,
                item.flatRotation
            );

            // Draw 4 lines per trapezoid
            for (let i = 0; i < 4; i++) {

                const p1 = pts[i];
                const p2 = pts[(i + 1) % 4];

                dxf += "0\nLINE\n";
                dxf += "8\n0\n"; // layer

                dxf += "10\n" + p1.x + "\n";
                dxf += "20\n" + (-p1.y) + "\n"; // invert Y for CAD
                dxf += "30\n0\n";

                dxf += "11\n" + p2.x + "\n";
                dxf += "21\n" + (-p2.y) + "\n";
                dxf += "31\n0\n";

            }

        });

        // END ENTITIES
        dxf += "0\nENDSEC\n0\nEOF";

        // Download
        const blob = new Blob([dxf], { type: "application/dxf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);

    }

}