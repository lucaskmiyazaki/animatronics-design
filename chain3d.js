import { THREE } from './threeView.js';

class Chain3DView {
    constructor(sharedView) {
        this.view = sharedView;
        this.group = this.view.getOrCreateGroup('chainGroup');
    }

    drawChain(chain, options = {}) {
        this.view.clearGroup(this.group);

        const baseCenter = { x: 0, y: 0, z: 0 };
        const length = 200;
        const diameter = 40;

        const radius = diameter / 2;

        const geometry = new THREE.CylinderGeometry(radius, radius, length, 20);
        const material = new THREE.MeshStandardMaterial({ color: 0xffaa33 });
        const cylinder = new THREE.Mesh(geometry, material);

        cylinder.rotation.z = Math.PI / 2;
        cylinder.position.set(baseCenter.x + length / 2, baseCenter.y, baseCenter.z);

        this.group.add(cylinder);
    }
}

window.chain3DView = new Chain3DView(window.skeleton3DView.view);