import { ThreeView, THREE } from './threeView.js';

class Skeleton3DView {
    constructor(containerId = 'three-container') {
        this.view = new ThreeView(containerId);
        this.group = this.view.getOrCreateGroup('skeletonGroup');
    }

    vec3(p) {
        return new THREE.Vector3(
            p.x,
            -p.y,
            p.z ?? 0
        );
    }

    clearSkeleton() {
        this.view.clearGroup(this.group);
    }

    drawSkeleton(skeleton, options = {}) {
        const { fitView = false } = options;

        this.clearSkeleton();

        if (!skeleton) return;

        const pointGeometry = new THREE.SphereGeometry(5, 16, 16);

        // Support both old flat structure and new branch structure
        if (skeleton.branches && skeleton.branches.length > 0) {
            const pointMaterial = new THREE.MeshStandardMaterial({ color: 0xff3333 });
            const lineMaterial = new THREE.LineBasicMaterial({ color: 0x3366ff });

            skeleton.branches.forEach(branch => {
                if (branch.points && branch.points.length > 0) {
                    branch.points.forEach(point => {
                        const sphere = new THREE.Mesh(pointGeometry, pointMaterial);
                        sphere.position.copy(this.vec3(point));
                        this.group.add(sphere);
                    });
                }

                if (branch.lines && branch.lines.length > 0) {
                    branch.lines.forEach(line => {
                        const start = this.vec3(line.start);
                        const end = this.vec3(line.end);

                        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
                        const mesh = new THREE.Line(geometry, lineMaterial);
                        this.group.add(mesh);
                    });
                }
            });

            // Draw connections if present
            if (skeleton.connections && skeleton.connections.length > 0) {
                const connectionMaterial = new THREE.LineBasicMaterial({ color: 0x9933ff, linewidth: 1 });

                skeleton.connections.forEach(conn => {
                    if (conn.proj) {
                        const start = this.vec3(
                            skeleton.branches[conn.fromBranch].points[0]
                        );

                        const end = this.vec3(conn.proj);

                        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
                        const mesh = new THREE.Line(geometry, connectionMaterial);
                        this.group.add(mesh);
                    }
                });
            }
        } else if (skeleton.points && skeleton.points.length > 0) {
            skeleton.points.forEach(point => {
                const pointMaterial = new THREE.MeshStandardMaterial({ color: 0xff3333 });
                const sphere = new THREE.Mesh(pointGeometry, pointMaterial);
                sphere.position.copy(this.vec3(point));
                this.group.add(sphere);
            });

            skeleton.lines.forEach(line => {
                const start = this.vec3(line.start);
                const end = this.vec3(line.end);

                const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
                const material = new THREE.LineBasicMaterial({ color: 0x3366ff });
                const mesh = new THREE.Line(geometry, material);
                this.group.add(mesh);
            });
        }

        if (fitView || !this.view.hasFittedOnce) {
            this.view.fitCameraToObject(this.group);
            this.view.hasFittedOnce = true;
        }
    }

    resetViewToSkeleton() {
        this.view.fitCameraToObject(this.group);
        this.view.hasFittedOnce = true;
    }
}

window.skeleton3DView = new Skeleton3DView('three-container');