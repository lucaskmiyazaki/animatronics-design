import { ThreeView, THREE } from './threeView.js';

class Skeleton3DView {
    constructor(containerId = 'three-container') {
        this.view = new ThreeView(containerId);
        this.group = this.view.getOrCreateGroup('skeletonGroup');
    }

    clearSkeleton() {
        this.view.clearGroup(this.group);
    }

    drawSkeleton(skeleton, options = {}) {
        const { fitView = false } = options;

        this.clearSkeleton();

        if (!skeleton || skeleton.points.length === 0) return;

        const pointGeometry = new THREE.SphereGeometry(5, 16, 16);

        skeleton.points.forEach(point => {
            const pointMaterial = new THREE.MeshStandardMaterial({ color: 0xff3333 });
            const sphere = new THREE.Mesh(pointGeometry, pointMaterial);
            sphere.position.set(point.x, point.y, point.z ?? 0);
            this.group.add(sphere);
        });

        skeleton.lines.forEach(line => {
            const start = new THREE.Vector3(
                line.start.x,
                line.start.y,
                line.start.z ?? 0
            );

            const end = new THREE.Vector3(
                line.end.x,
                line.end.y,
                line.end.z ?? 0
            );

            const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
            const material = new THREE.LineBasicMaterial({ color: 0x3366ff });
            const mesh = new THREE.Line(geometry, material);
            this.group.add(mesh);
        });

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