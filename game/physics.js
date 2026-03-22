// ============================================
// PLAYER PHYSICS COMPONENT
// handles WASD movement and jumping
// ============================================
AFRAME.registerComponent('player-physics', {

    init() {
        this.keys = {};
        this.canJump = false; // only jump when on the ground
        this.jumping = false;
        this.speed = 5;
        this.jumpForce = 12;

        // track keys
        this.onKeyDown = (e) => {
            this.keys[e.code] = true;

            // jump on Space
            if (e.code === 'Space' && this.canJump) {
            this.jump();
            }
        };
        this.onKeyUp = (e) => { this.keys[e.code] = false; };

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup',   this.onKeyUp);

        // when player hits something check if its below the player
        this.el.addEventListener('collide', (e) => {
            this.onCollide(e);
        });
    },

    jump() {
        const body = this.el.components['dynamic-body'].body;
        if (!body) return;

        // apply an upward impulse at the players center
        body.velocity.set(0, this.jumpForce, 0);
        this.canJump = false;
        this.jumping = true;

        console.log('jumped!');
    },

    onCollide(e) {
        // check if what player hits is below by comparing contact normal
        const contact = e.detail.contact;
        if (!contact) return;

        const normal = contact.ni; // collision normal vector

        // if the normal is pointing mostly upward, player on top something
        if (normal.y > 0.5) {
            this.canJump = true;
            this.jumping = false;
        }
    },

    tick(time, delta) {
        const bodyComponent = this.el.components['dynamic-body'];
        if (!bodyComponent || !bodyComponent.body) return; // not ready yet

        const body = this.el.components['dynamic-body']?.body;
        if (!body) return;

        // extract yaw from cameras look-controls rotation
        const camera = document.getElementById('main-camera');
        const worldQuat = new THREE.Quaternion();
        camera.object3D.getWorldQuaternion(worldQuat);
        const euler = new THREE.Euler();
        euler.setFromQuaternion(worldQuat, 'YXZ');
        const angle = euler.y;

        const moveX   = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
        const moveZ   = (this.keys['KeyS'] ? 1 : 0) - (this.keys['KeyW'] ? 1 : 0);

        // rotate movement vector by cameras look direction
        const vx = moveX * Math.cos(angle) + moveZ * Math.sin(angle);
        const vz = -moveX * Math.sin(angle) + moveZ * Math.cos(angle);

        const spd = this.speed * (delta / 1000) * 60;
        body.velocity.x = vx * spd;
        body.velocity.z = vz * spd;

        const isFalling = body.velocity.y < -0.1;
        if (isFalling) {
            this.canJump   = false;
            this.jumping   = false;
        }
        
        if (this.canJump && !this.jumping) {
            body.velocity.y = Math.max(body.velocity.y, 0);
        }

        // keep player upright
        body.quaternion.set(0, body.quaternion.y, 0, body.quaternion.w);
    },

    remove() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup',   this.onKeyUp);
    },
});